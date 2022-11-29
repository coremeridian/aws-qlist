const {
    CloudFrontClient,
    GetDistributionConfigCommand,
} = require("@aws-sdk/client-cloudfront");
const {
    CodePipelineClient,
    PutJobSuccessResultCommand,
    PutJobFailureResultCommand,
} = require("@aws-sdk/client-codepipeline");
const {
    LambdaClient,
    ListVersionsByFunctionCommand,
    UpdateFunctionConfigurationCommand,
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
            const Id = userParams["distributionId"];
            if (Id && Id !== "") {
                console.log("What's going on in here?");
                let response = await cloudfront.send(
                    new GetDistributionConfigCommand({
                        Id,
                    })
                );
                const { Etag } = response;

                const edgeRequest = await lambda.send(
                    new ListVersionsByFunctionCommand({
                        FunctionName: "SSR-Edge-request",
                        MaxItems: 1,
                    })
                );

                const lambdaConfig = edgeRequest.Versions[0];
                await lambda.send(
                    new UpdateFunctionConfigurationCommand({
                        FunctionName: lambdaConfig.FunctionName,
                        Environment: { ...lambdaConfig.Environment, ETAG: Etag },
                    })
                );
            }
        }
        const successCommand = new PutJobSuccessResultCommand({
            jobId,
        });
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
