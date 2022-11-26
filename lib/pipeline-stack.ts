import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { CfnParametersCode, Function } from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import {
    BuildSpec,
    LinuxBuildImage,
    PipelineProject,
} from "aws-cdk-lib/aws-codebuild";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
    CacheControl,
    CodeBuildAction,
    GitHubSourceAction,
    CodeStarConnectionsSourceAction,
    GitHubTrigger,
    S3DeployAction,
    LambdaInvokeAction,
    CloudFormationCreateUpdateStackAction,
    ManualApprovalAction,
} from "aws-cdk-lib/aws-codepipeline-actions";
import { BuildEnvironmentVariableType } from "aws-cdk-lib/aws-codebuild";
import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import { CfnParameter } from "aws-cdk-lib/aws-ssm";
import PipelineLambdaStepStack from "../lib/pipeline-lambdas-stack";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";

interface PipelineStackProps extends cdk.StackProps {
    readonly webappBucket: Bucket;
    readonly apiLambdaCode: CfnParametersCode;
    readonly edgeLambdaCode: CfnParametersCode;
    readonly edgeRespLambdaCode: CfnParametersCode;
    readonly edgeInvalidator: Function;
    readonly integratorFunction: Function;
    readonly distributionId: string;
}

export default class PipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: PipelineStackProps) {
        super(scope, id, props);

        const sourceOutput = new Artifact();
        const cdkSourceOutput = new Artifact("cdk");

        const buildHtmlOutput = new Artifact("base");
        const buildStaticOutput = new Artifact("static");
        const cdkBuildOutput = new Artifact("CdkBuildOutput");

        const lambdaBuildOutput = new Artifact("lambda");
        const edgeBuildOutput = new Artifact("edge");
        const edgeRespBuildOutput = new Artifact("edgeResp");

        const distributionId = props.distributionId;

        const buildApprovalAction = new ManualApprovalAction({
            actionName: "Approve",
        });
        const deployApprovalAction = new ManualApprovalAction({
            actionName: "Approve",
        });

        const invalidateBuildProject = new PipelineProject(
            this,
            `InvalidateProject`,
            {
                buildSpec: BuildSpec.fromObject({
                    version: "0.2",
                    phases: {
                        build: {
                            commands: [
                                'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"',
                                // Choose whatever files or paths you'd like, or all files as specified here
                            ],
                        },
                    },
                }),
                environmentVariables: {
                    CLOUDFRONT_ID: { value: distributionId },
                },
            }
        );

        const distributionArn = `arn:aws:cloudfront::${this.account}:distribution/${distributionId}`;
        invalidateBuildProject.addToRolePolicy(
            new PolicyStatement({
                resources: [distributionArn],
                actions: ["cloudfront:CreateInvalidation"],
            })
        );

        const s3VersionId = new CfnParameter(this, "s3VersionId", {
            type: "String",
            value: "null",
        });

        const pipeline = new Pipeline(this, "React-Qlist-Pipeline", {
            stages: [
                {
                    stageName: "Source",
                    actions: [
                        new CodeStarConnectionsSourceAction({
                            actionName: "Checkout",
                            owner: "coremeridian",
                            repo: "qlist",
                            output: sourceOutput,
                            connectionArn:
                                "arn:aws:codestar-connections:us-east-1:416591453861:connection/cff049b0-3e4d-4e0f-85e9-9b8a7c8245dc",
                        }),
                        new CodeStarConnectionsSourceAction({
                            actionName: "Checkout-aws",
                            owner: "coremeridian",
                            repo: "aws-qlist",
                            output: cdkSourceOutput,
                            connectionArn:
                                "arn:aws:codestar-connections:us-east-1:416591453861:connection/cff049b0-3e4d-4e0f-85e9-9b8a7c8245dc",
                        }),
                    ],
                },
                {
                    stageName: "Build-Approve",
                    actions: [buildApprovalAction],
                },
                {
                    stageName: "Build",
                    actions: [
                        new CodeBuildAction({
                            actionName: "aws-qlist",
                            project: new PipelineProject(this, "Build AWS", {
                                projectName: "AWSQlist",
                                buildSpec: BuildSpec.fromObject({
                                    version: "0.2",
                                    phases: {
                                        install: {
                                            commands: ["npm install"],
                                        },
                                        build: {
                                            commands: ["npx cdk synth"],
                                        },
                                    },
                                    artifacts: {
                                        "base-directory": "cdk.out",
                                        files: ["**/*"],
                                    },
                                }),
                                environment: {
                                    buildImage: LinuxBuildImage.STANDARD_5_0,
                                    privileged: true,
                                },
                            }),
                            input: cdkSourceOutput,
                            outputs: [cdkBuildOutput],
                            runOrder: 2,
                        }),
                        new CodeBuildAction({
                            actionName: "qlist",
                            project: new PipelineProject(this, "Build", {
                                projectName: "Qlist",
                                buildSpec: BuildSpec.fromObject({
                                    version: "0.2",
                                    phases: {
                                        install: {
                                            commands: ["yarn install"],
                                        },
                                        build: {
                                            commands: [
                                                "yarn build-all",
                                                "cd build/dist",
                                                "cp index.html ../edge-dist/",
                                            ],
                                        },
                                    },
                                    artifacts: {
                                        files: ["**/*"],
                                        "secondary-artifacts": {
                                            [buildHtmlOutput.artifactName as string]:
                                                {
                                                    "base-directory":
                                                        "build/dist",
                                                    files: ["*.html"],
                                                },
                                            [buildStaticOutput.artifactName as string]:
                                                {
                                                    "base-directory":
                                                        "build/dist",
                                                    files: ["static/**/*"],
                                                },
                                            [lambdaBuildOutput.artifactName as string]:
                                                {
                                                    "base-directory":
                                                        "build/server-dist",
                                                    files: ["**/*"],
                                                },
                                            [edgeBuildOutput.artifactName as string]:
                                                {
                                                    "base-directory":
                                                        "build/edge-dist",
                                                    files: ["**/*"],
                                                    "exclude-paths": [
                                                        "./response.js",
                                                    ],
                                                },
                                            [edgeRespBuildOutput.artifactName as string]:
                                                {
                                                    "base-directory":
                                                        "build/edge-dist",
                                                    files: ["response.js"],
                                                },
                                        },
                                    },
                                }),
                                environment: {
                                    buildImage: LinuxBuildImage.STANDARD_5_0,
                                    environmentVariables: {
                                        API_KEY: {
                                            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                                            value: "prod-database-access:codepipeline-api-key",
                                        },
                                        APP_URL: {
                                            value: process.env.APP_URL ?? "",
                                        },
                                        BASE_API_URL: {
                                            value:
                                                process.env.BASE_API_URL ?? "",
                                        },
                                        AUTH_URL: {
                                            value: process.env.AUTH_URL ?? "",
                                        },
                                        MAIN_PAGE_URL: {
                                            value:
                                                process.env.MAIN_PAGE_URL ?? "",
                                        },
                                        VAULT_URL: {
                                            value: process.env.VAULT_URL ?? "",
                                        },
                                        TESTSGRPC_PROD: {
                                            value:
                                                process.env.TESTSGRPC_PROD ??
                                                "",
                                        },
                                        TESTSAPI_PROD: {
                                            value:
                                                process.env.TESTSAPI_PROD ?? "",
                                        },
                                    },
                                },
                            }),
                            input: sourceOutput,
                            outputs: [
                                buildStaticOutput,
                                buildHtmlOutput,
                                lambdaBuildOutput,
                                edgeBuildOutput,
                                edgeRespBuildOutput,
                            ],
                            runOrder: 2,
                        }),
                    ],
                },
                {
                    stageName: "Deploy-Approve",
                    actions: [deployApprovalAction],
                },
                {
                    stageName: "Deploy",
                    actions: [
                        new S3DeployAction({
                            actionName: "Static-Assets",
                            input: buildStaticOutput,
                            bucket: props.webappBucket,
                            cacheControl: [
                                CacheControl.setPublic(),
                                CacheControl.maxAge(cdk.Duration.days(1)),
                            ],
                            runOrder: 1,
                        }),
                        new S3DeployAction({
                            actionName: "HTML-Assets",
                            input: buildHtmlOutput,
                            bucket: props.webappBucket,
                            cacheControl: [CacheControl.noCache()],
                            runOrder: 2,
                        }),

                        new CloudFormationCreateUpdateStackAction({
                            actionName: "Lambda-API-Deploy",
                            templatePath: cdkBuildOutput.atPath(
                                "AppAPI.template.json"
                            ),
                            stackName: "AppAPI",
                            adminPermissions: true,
                            parameterOverrides: {
                                ...props.apiLambdaCode.assign(
                                    ((location) => ({
                                        ...location,
                                        objectVersion: s3VersionId.attrValue,
                                    }))(lambdaBuildOutput.s3Location)
                                ),
                            },
                            extraInputs: [lambdaBuildOutput],
                            runOrder: 3,
                        }),
                        new CloudFormationCreateUpdateStackAction({
                            actionName: "Lambda-SSR-Deploy",
                            templatePath: cdkBuildOutput.atPath(
                                "AppSSR.template.json"
                            ),
                            stackName: "AppSSR",
                            adminPermissions: true,
                            parameterOverrides: {
                                ...props.edgeLambdaCode.assign(
                                    ((location) => ({
                                        ...location,
                                        //objectVersion: s3VersionId.attrValue,
                                    }))(edgeBuildOutput.s3Location)
                                ),
                                ...props.edgeRespLambdaCode.assign(
                                    ((location) => ({
                                        ...location,
                                        //objectVersion: s3VersionId.attrValue,
                                    }))(edgeRespBuildOutput.s3Location)
                                ),
                            },
                            extraInputs: [edgeBuildOutput, edgeRespBuildOutput],
                            runOrder: 3,
                        }),
                        new CodeBuildAction({
                            actionName: "InvalidateCache",
                            project: invalidateBuildProject,
                            input: buildHtmlOutput,
                            extraInputs: [buildStaticOutput],
                            runOrder: 3,
                        }),
                        new LambdaInvokeAction({
                            actionName: "InvalidateEdge",
                            lambda: props.edgeInvalidator,
                            runOrder: 4,
                        }),
                        new LambdaInvokeAction({
                            actionName: "Integrate",
                            lambda: props.integratorFunction,
                            runOrder: 4,
                        }),
                    ],
                },
            ],
        });
    }
}
