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
const { LambdaClient, GetAliasCommand } = require("@aws-sdk/client-lambda");
const { fromNodeProviderChain } = require("@aws-sdk/credential-providers");

const config = {
    credentials: fromNodeProviderChain(),
    region: process.env.CDK_DEFAULT_REGION,
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
        console.log(userParams);
        const Id = userParams["distributionId"];

        if (Id && Id !== "null") {
            const getDistributionConfigCommand = new GetDistributionConfigCommand({
                Id,
            });

            let response = await cloudfront.send(getDistributionConfigCommand);
            const { Etag: IfMatch, distributionConfig } = response;

            const getAliasCommand = new GetAliasCommand({
                FunctionName: "ssrEdge",
                Name: "Prod",
            });
            response = await lambda.send(getAliasCommand);

            distributionConfig["DefaultCacheBehavior"]["LambdaFunctionAssociations"][
                "Items"
            ][0]["LambdaFunctionARN"] = response["AliasArn"];

            const updateDistributionCommand = UpdateDistributionCommand({
                Id,
                distributionConfig: distributionConfig,
                IfMatch,
            });
            await cloudfront.send(updateDistributionCommand);
        }
        const successCommand = new PutJobSuccessResultCommand({ jobId });
        await codepipeline.send(successCommand);
    } catch (error) {
        const failureCommand = new PutJobFailureResultCommand({
            failureDetails: {
                message: `${error.message}`,
                type: "JobFailed",
            },
            jobId,
        });
        codepipeline.send(failureCommand, (err, data) => {
            if (err) console.log(err, err.stack);
            else console.log(data);
        });
    }
};
