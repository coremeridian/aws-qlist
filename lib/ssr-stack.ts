import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import {
    CloudFrontWebDistribution,
    OriginAccessIdentity,
    PriceClass,
    LambdaEdgeEventType,
    OriginProtocolPolicy,
    ViewerCertificate,
    CloudFrontAllowedMethods,
    CloudFrontAllowedCachedMethods,
} from "aws-cdk-lib/aws-cloudfront";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sm from "aws-cdk-lib/aws-secretsmanager";

interface SsrStackProps extends cdk.StackProps {
    readonly s3BucketSource: Bucket;
    readonly cloudfrontOAI: OriginAccessIdentity;
    readonly apiDomainName: string;
    readonly certificateArn: string;
    readonly domainName: string;
    readonly edgeLambdaCode: lambda.CfnParametersCode;
    readonly edgeRespLambdaCode: lambda.CfnParametersCode;
}

export default class SsrStack extends cdk.Stack {
    readonly distributionId: string;

    constructor(scope: Construct, id: string, props: SsrStackProps) {
        super(scope, id, props);

        const requestEdge = this.ssrEdgeFunction(
            props.edgeLambdaCode,
            "request"
        );
        const requestVersion = new lambda.Version(
            this,
            "ssr-edge-req-version",
            { lambda: requestEdge }
        );

        const responseEdge = this.ssrEdgeFunction(
            props.edgeRespLambdaCode,
            "response"
        );
        const responseVersion = new lambda.Version(
            this,
            "ssr-edge-resp-version",
            { lambda: responseEdge }
        );

        const secret = sm.Secret.fromSecretAttributes(
            this,
            "SSRDBAccessSecrets",
            {
                secretCompleteArn:
                    "arn:aws:secretsmanager:us-east-1:416591453861:secret:prod-database-access-VARKmP",
            }
        );
        const apiKey = secret
            .secretValueFromJson("codepipeline-api-key")
            .toString();

        const distribution = new CloudFrontWebDistribution(this, "app-cdn", {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: props.s3BucketSource,
                        originAccessIdentity: props.cloudfrontOAI,
                        originHeaders: {
                            "X-API-KEY": apiKey,
                            "APP-URL": process.env.APP_URL ?? "",
                            "BASE-API-URL": process.env.BASE_API_URL ?? "",
                            "AUTH-URL": process.env.AUTH_URL ?? "",
                            "MAIN-PAGE-URL": process.env.MAIN_PAGE_URL ?? "",
                        },
                    },
                    behaviors: [
                        {
                            allowedMethods:
                                CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
                            isDefaultBehavior: true,
                            forwardedValues: {
                                queryString: true,
                                cookies: { forward: "all" },
                            },
                            lambdaFunctionAssociations: [
                                {
                                    eventType:
                                        LambdaEdgeEventType.ORIGIN_REQUEST,
                                    lambdaFunction: requestVersion,
                                },
                            ],
                        },
                        {
                            allowedMethods:
                                CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
                            pathPattern: "/*.*",
                            forwardedValues: {
                                queryString: false,
                                cookies: { forward: "none" },
                            },
                            lambdaFunctionAssociations: [
                                {
                                    eventType:
                                        LambdaEdgeEventType.ORIGIN_RESPONSE,
                                    lambdaFunction: responseVersion,
                                },
                            ],
                        },
                    ],
                },
                {
                    customOriginSource: {
                        domainName: props.apiDomainName,
                        originPath: "/prod",
                        originProtocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
                    },
                    behaviors: [
                        {
                            allowedMethods: CloudFrontAllowedMethods.ALL,
                            pathPattern: "api/*",
                            forwardedValues: {
                                queryString: true,
                                cookies: { forward: "all" },
                            },
                        },
                    ],
                },
            ],
            errorConfigurations: [
                {
                    errorCode: 404,
                    responseCode: 200,
                    responsePagePath: "/index.html",
                    errorCachingMinTtl: 0,
                },
            ],
            priceClass: PriceClass.PRICE_CLASS_100,
            viewerCertificate: {
                aliases: [props.domainName],
                props: {
                    acmCertificateArn: props.certificateArn,
                    sslSupportMethod: "sni-only",
                },
            },
        });

        this.distributionId = distribution.distributionId;
        new cdk.CfnOutput(this, "DistributionIDRef", {
            value: distribution.distributionId,
            exportName: "DistributionID",
        });

        new cdk.CfnOutput(this, "CF URL", {
            value: `https://${distribution.distributionDomainName}`,
        });

        const hostedZone = HostedZone.fromLookup(this, "HostedZone", {
            domainName: "coremeridian.xyz",
            privateZone: false,
        });

        new ARecord(this, "Alias", {
            zone: hostedZone,
            recordName: "qlist",
            target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        });
    }

    private ssrEdgeFunction(code: lambda.Code, index: string): lambda.Function {
        const currentDate = new Date().toISOString();
        const id = `ssr@Edge-${index}`;
        return new lambda.Function(this, id, {
            functionName: `SSR-Edge-${index}`,
            runtime: lambda.Runtime.NODEJS_16_X,
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            handler: `${index}.edge.handler`,
            description: `Generated on: ${currentDate}`,
            currentVersionOptions: {
                removalPolicy: cdk.RemovalPolicy.RETAIN,
            },
            code,
        });
    }
}
