const {
    CloudFrontClient,
    GetDistributionConfigCommand,
    UpdateDistributionCommand,
} = require("@aws-sdk/client-cloudfront");
const {
    CodePipelineClient,
    PutJobSuccessResultCommand,
    PutJobFailureResultCommand,
} = require("@aws-sdk/client-codepipeline");
const {
    LambdaClient,
    ListVersionsByFunctionCommand,
} = require("@aws-sdk/client-lambda");
const { fromNodeProviderChain } = require("@aws-sdk/credential-providers");

const config = {
    credentials: fromNodeProviderChain(),
    region: process.env.REGION,
};

exports.handler = async (event) => {
    const cloudfront = new CloudFrontClient(config);
    const codepipeline = new CodePipelineClient(config);
    const lambda = new LambdaClient(config);

    const jobId = event["CodePipeline.job"].id;
    const userParams =
        event["CodePipeline.job"].data.actionConfiguration.configuration
            .UserParameters;

    try {
        if (userParams) {
            const edgeReqVersionsCommand = new ListVersionsByFunctionCommand({
                FunctionName: "SSR-Edge-request",
                MaxItems: 1,
            });
            const edgeRequest = await lambda.send(edgeReqVersionsCommand);

            const edgeRespVersionsCommand = new ListVersionsByFunctionCommand({
                FunctionName: "SSR-Edge-response",
                MaxItems: 1,
            });
            const edgeResponse = await lambda.send(edgeRespVersionsCommand);

            const Id = userParams["distributionId"];
            if (Id && Id !== "") {
                let response = await cloudfront.send(
                    new GetDistributionConfigCommand({
                        Id,
                    })
                );
                const { Etag: IfMatch, distributionConfig } = response;

                distributionConfig["DefaultCacheBehavior"][
                    "LambdaFunctionAssociations"
                ]["Items"].map((item) => {
                    if (item.EventType === "origin-request") {
                        item.LambdaFunctionARN = edgeRequest.Versions[0];
                    } else if (item.EventType === "origin-response") {
                        item.LambdaFunctionARN = edgeResponse.Versions[0];
                    }
                    return item;
                });

                await cloudfront.send(
                    new UpdateDistributionCommand({
                        Id,
                        distributionConfig: distributionConfig,
                        IfMatch,
                    })
                );
            }
        }
        const successCommand = new PutJobSuccessResultCommand({ jobId });
        await codepipeline.send(successCommand);
    } catch (error) {
        const failureCommand = new PutJobFailureResultCommand({
            failureDetails: {
                message: error.message,
                type: "JobFailed",
            },
            jobId,
        });
        console.log("Error: ", error.message);
        await codepipeline.send(failureCommand);
    }
};
