import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";

export default class PipelineLambdaStepStack extends cdk.Stack {
    readonly edgeInvalidator: lambda.Function;
    readonly integratorFunction: lambda.Function;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.edgeInvalidator = this.createEdgeInvalidatorFunction();
        this.integratorFunction = this.createIntegratorFunction();
    }

    private createLambdaFunction(
        id: string,
        path: string,
        aliasId: string
    ): lambda.Function {
        let lambdaFn = new lambda.DockerImageFunction(this, id, {
            code: lambda.DockerImageCode.fromImageAsset(
                `./helpers/functions/packages/${path}`,
                {
                    cmd: ["index.handler"],
                }
            ),
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            currentVersionOptions: {
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            },
            environment: {
                REGION: this.region,
            },
        });

        let version = lambdaFn.currentVersion;
        new lambda.Alias(this, aliasId, {
            aliasName: "Prod",
            version,
        });
        return lambdaFn;
    }

    private createEdgeInvalidatorFunction(): lambda.Function {
        const fn = this.createLambdaFunction(
            "edge-invalidator",
            "invalidators/cloudfront-edge-invalidate",
            "edgeInvalidatorAlias"
        );

        const ssrFunctionInvalidationPolicy = new iam.PolicyStatement({
            resources: ["arn:aws:lambda:*:*:function:SSR-Edge-*"],
            actions: ["lambda:*"],
            effect: iam.Effect.ALLOW,
        });

        fn.role?.attachInlinePolicy(
            new iam.Policy(this, "ssr-edge-invalidation-policy", {
                statements: [ssrFunctionInvalidationPolicy],
            })
        );

        return fn;
    }

    private createIntegratorFunction(): lambda.Function {
        const fn = this.createLambdaFunction(
            "integrator-function",
            "integrator",
            "integratorAlias"
        );

        const integrationPolicy = new iam.PolicyStatement({
            resources: [
                "arn:aws:lambda:*:*:function:SSR-Edge-*",
                "arn:aws:lambda:*:*:function:API-*",
            ],
            actions: ["lambda:*"],
            effect: iam.Effect.ALLOW,
        });

        fn.role?.attachInlinePolicy(
            new iam.Policy(this, "api-integration-policy", {
                statements: [integrationPolicy],
            })
        );

        return fn;
    }
}
