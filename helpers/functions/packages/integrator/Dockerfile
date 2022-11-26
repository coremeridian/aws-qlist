FROM public.ecr.aws/lambda/nodejs:16

COPY package.json ${LAMBDA_TASK_ROOT}
RUN npm install --omit=dev
COPY index.js ${LAMBDA_TASK_ROOT}
CMD [ "index.handler" ]
