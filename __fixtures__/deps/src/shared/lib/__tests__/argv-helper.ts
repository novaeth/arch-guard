// 测试夹具：直接读 argv 验证参数透传；产品代码里只许 commander
export const argAt = (index: number): string | undefined => process.argv[index]
