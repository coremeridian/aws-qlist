#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3BucketCfnStack } from "../lib/s3-bucket-stack";
import SsrStack from "../lib/ssr-stack";
import PipelineStack from "../lib/pipeline-stack";
import APIStack from "../lib/api-stack";
import PipelineLambdaStepStack from "../lib/pipeline-lambdas-stack";
import CertificateStack from "../lib/certificate-stack";
import * as lambda from 'aws-cdk-lib/aws-lambda';

require("dotenv").config({ path: "./lib/.env" });

const envProps = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
};

const app = new cdk.App();
//const resourceStore = new ResourceStore(app, "ResourceStore", { env: envProps });

const apiLambdaCode = lambda.Code.fromCfnParameters();
const edgeLambdaCode = lambda.Code.fromCfnParameters();
const edgeRespLambdaCode = lambda.Code.fromCfnParameters();

const appName = app.node.tryGetContext('bucket_name') ?? "qlist-webapp";
const s3Bucket = new S3BucketCfnStack(app, "QlistS3", { env: envProps, bucketName: appName });
const appApi = new APIStack(app, "AppAPI", { env: envProps, lambdaCode: apiLambdaCode });
const certificate = new CertificateStack(app, "Certificate", { env: envProps });
const ssr = new SsrStack(app, "AppSSR", {
    env: envProps,
    s3BucketSource: s3Bucket.bucket,
    cloudfrontOAI: s3Bucket.cloudfrontOAI,
    apiDomainName: appApi.apiEndpoint,
    certificateArn: certificate.certificateArnCfn.value,
    domainName: certificate.domainName,
    edgeLambdaCode,
    edgeRespLambdaCode,
});

const plss = new PipelineLambdaStepStack(app, "PipelineLambdaSteps", { env: envProps });
new PipelineStack(app, "MonolithPipeline", {
    env: envProps,
    webappBucket: s3Bucket.bucket,
    apiLambdaCode,
    edgeLambdaCode,
    edgeRespLambdaCode,
    edgeInvalidator: plss.edgeInvalidator,
    integratorFunction: plss.integratorFunction,
    distributionId: ssr.distributionId,
});
