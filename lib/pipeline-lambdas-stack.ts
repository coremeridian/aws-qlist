import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";

export default class PipelineLambdaStepStack extends cdk.Stack {
    readonly edgeInvalidator: lambda.Function;
    readonly integratorFunction: lambda.Function;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.edgeInvalidator = this.createLambdaFunction(
            "edge-invalidator",
            "invalidators/cloudfront-edge-invalidate",
            "edgeInvalidatorAlias"
        );
        this.integratorFunction = this.createLambdaFunction(
            "integrator-function",
            "integrator",
            "integratorAlias"
        );
    }

    createLambdaFunction(id: string, path: string, aliasId: string) {
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
        });

        let version = lambdaFn.currentVersion;
        new lambda.Alias(this, aliasId, {
            aliasName: "Prod",
            version,
        });
        return lambdaFn;
    }
}
