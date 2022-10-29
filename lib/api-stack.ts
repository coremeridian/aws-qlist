import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import { default as axios } from "axios";

interface APIStackProps extends cdk.StackProps {
    readonly lambdaCode: lambda.CfnParametersCode;
}

export default class APIStack extends cdk.Stack {
    readonly apiEndpoint: string;

    constructor(scope: Construct, id: string, props: APIStackProps) {
        super(scope, id, props);

        const secret = sm.Secret.fromSecretAttributes(
            this,
            "ProdDBAccessSecrets",
            {
                secretCompleteArn:
                    "arn:aws:secretsmanager:us-east-1:416591453861:secret:prod-database-access-VARKmP",
            }
        );
        const apiKey = secret
            .secretValueFromJson("codepipeline-api-key")
            .toString();

        const currentDate = new Date().toISOString();
        const primaryLambda = this.createNodeLambdaFromCfnCode(
            props.lambdaCode,
            {
                name: "primary",
                handler: "handler",
            },
            currentDate,
            {
                APP_URL: process.env.APP_URL ?? "",
                VAULT_URL: process.env.VAULT_URL ?? "",
                API_KEY: apiKey,
                TESTSGRPC_PROD: process.env.TESTSGRPC_PROD ?? "",
                TESTSAPI_PROD: process.env.TESTSAPI_PROD ?? "",
            }
        );

        const lambdas = this.processLambdas({
            primary: primaryLambda,
        });

        const backendLambda = lambdas.primary as {
            alias: lambda.IFunction;
            currentVersion: any;
        };
        const monolithBackend = new apigw.LambdaRestApi(
            this,
            "monolithBackendEndpoint",
            {
                proxy: true,
                restApiName: "Qlist Backend",
                handler: backendLambda.alias,
                defaultCorsPreflightOptions: {
                    allowOrigins: apigw.Cors.ALL_ORIGINS,
                    allowMethods: apigw.Cors.ALL_METHODS,
                },
            }
        );

        this.apiEndpoint = `${monolithBackend.restApiId}.execute-api.${this.region}.${this.urlSuffix}`;
    }

    private createNodeLambdaFromCfnCode(
        code: lambda.Code,
        config: { name: string; handler: string },
        currentDate: string,
        environment: { [key: string]: string } = {}
    ): lambda.Function {
        return new lambda.Function(this, config.name, {
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            handler: `index.server.${config.handler}`,
            description: `Generated on: ${currentDate}`,
            currentVersionOptions: {
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            },
            code,
            environment,
        });
    }

    private processLambdas(lambdas: {
        [key: string]:
            | lambda.Function
            | { alias: lambda.IFunction; currentVersion: any };
    }) {
        Object.entries(lambdas).forEach(([key, value]) => {
            const val = value as lambda.Function;
            const version = val.currentVersion;
            const alias = new lambda.Alias(this, `${key}:Alias`, {
                aliasName: "Prod",
                version,
            });
            lambdas[key] = { alias, currentVersion: version };
        });
        return lambdas;
    }
}
