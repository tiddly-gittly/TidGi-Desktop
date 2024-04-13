export const isWorkerDevelopment = process.env.NODE_ENV === 'development';
export const isWorkerTest = process.env.NODE_ENV === 'test';
export const isWorkerDevelopmentOrTest = isWorkerDevelopment || isWorkerTest;
