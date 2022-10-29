FROM public.ecr.aws/lambda/nodejs:14

COPY package.json ${LAMBDA_TASK_ROOT}
RUN npm install --only=production
COPY index.js ${LAMBDA_TASK_ROOT}
CMD [ "index.handler" ]
