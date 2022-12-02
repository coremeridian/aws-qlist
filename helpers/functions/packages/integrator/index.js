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

const http = require("http");

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
            const { distributionId: Id, originUrl: ORIGIN_SOURCE } = userParams;
            if (Id && Id !== "") {
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

                /*const edgeResponse = await lambda.send(
                                            new ListVersionsByFunctionCommand({
                                                FunctionName: "SSR-Edge-response",
                                                MaxItems: 1,
                                            })
                                        );*/

                const edgeReqConfig = edgeRequest.Versions[0];
                await lambda.send(
                    new UpdateFunctionConfigurationCommand({
                        FunctionName: edgeReqConfig.FunctionName,
                        Environment: {
                            ...edgeReqConfig.Environment,
                            ETAG: Etag,
                            ORIGIN_SOURCE,
                        },
                    })
                );

                const postReq = http.request({
                    host: "qlist.coremeridian.xyz",
                    port: "443",
                    path: "/send_request",
                    method: "POST",
                });

                postReq.end({ address: ORIGIN_SOURCE });
                /*const edgeRespConfig = edgeResponse.Versions[0];
                           await lambda.send(
                           new UpdateFunctionConfigurationCommand({
                           FunctionName: edgeRespConfig.FunctionName,
                           })
                           );*/
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
