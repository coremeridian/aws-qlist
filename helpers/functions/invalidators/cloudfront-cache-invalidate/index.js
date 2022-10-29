const {
    CloudFrontClient,
    CreateInvalidationCommand,
} = require("@aws-sdk/client-cloudfront");
const {
    CodePipelineClient,
    PutJobSuccessResultCommand,
    PutJobFailureResultCommand,
} = require("@aws-sdk/client-codepipeline");
const { fromNodeProviderChain } = require("@aws-sdk/credential-providers");

const config = {
    credentials: fromNodeProviderChain(),
    region: process.env.CDK_DEFAULT_REGION,
};

exports.handler = async (event) => {
    const cloudfront = new CloudFrontClient(config);
    const codepipeline = new CodePipelineClient(config);

    const jobId = event["CodePipeline.job"]["id"];
    const userParams =
        event["CodePipeline.job"]["data"]["actionConfiguration"][
            "configuration"
        ]["UserParameters"];

    const invalidationCommand = new CreateInvalidationCommand({
        DistributionId: userParams["distributionId"],
        InvalidationBatch: {
            CallerReference: event["CodePipeline.job"]["id"],
            Paths: {
                Quantity: len(userParams["objectPaths"]),
                Items: userParams["objectPaths"],
            },
        },
    });

    try {
        await cloudfront.send(invalidationCommand);
        const successCommand = new PutJobSuccessResultCommand({ jobId });
        await codepipeline.send(successCommand);
    } catch (error) {
        const failureCommand = new PutJobFailureResultCommand({
            failureDetails: {
                message: `${error.message}`,
                type: "JobFailed",
            },
            jodId,
        });
        codepipeline.send(failureCommand, (err, data) => {
            if (err) console.log(err, err.stack);
            else console.log(data);
        });
    }
};
