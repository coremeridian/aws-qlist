import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";

export default class PipelineLambdaStepStack extends cdk.Stack {
    readonly cloudfrontEdgeInvalidator: lambda.Function;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const lambdaFn = new lambda.DockerImageFunction(
            this,
            "cloudfront-edge-invalidator",
            {
                code: lambda.DockerImageCode.fromImageAsset(
                    "./helpers/functions/invalidators/cloudfront-edge-invalidate",
                    {
                        cmd: ["index.handler"],
                    }
                ),
                memorySize: 128,
                timeout: cdk.Duration.seconds(5),
                currentVersionOptions: {
                    removalPolicy: cdk.RemovalPolicy.DESTROY,
                },
            }
        );

        const version = lambdaFn.currentVersion;
        new lambda.Alias(this, "edgeInvalidatorAlias", {
            aliasName: "Prod",
            version,
        });
        this.cloudfrontEdgeInvalidator = lambdaFn;
    }
}
