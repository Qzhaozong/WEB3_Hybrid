// scripts/deploy.js - 部署AdvancedToken合约的脚本文件

// 定义主函数，使用async关键字表示这是一个异步函数
async function main() {
    // 从ethers库获取签名者列表，并将第一个签名者赋值给deployer变量
    // 签名者代表以太坊账户，用于部署合约和发送交易
    const [deployer] = await ethers.getSigners();

    // 打印部署者的地址
    console.log("部署者地址:", deployer.address);
    // 打印部署者的余额，并将BigNumber转换为字符串
    console.log("部署者余额:", (await ethers.provider.getBalance(deployer.address)).toString());

    // 部署AdvancedToken合约
    // 获取AdvancedToken合约的工厂对象，用于部署合约
    const AdvancedToken = await ethers.getContractFactory("AdvancedToken");
    // 使用工厂对象部署合约，并传入构造函数参数
    const advancedToken = await AdvancedToken.deploy(
        "Web3 Token",      // 代币名称
        "WEB3",            // 代币符号
        18,                // 小数位数
        1000000,           // 发行总量: 100万
        deployer.address,  // 所有者地址
        deployer.address,  // 手续费接收地址
        100                // 转账手续费: 1% (100/10000)
    );

    // 打印部署成功的AdvancedToken合约地址
    console.log("AdvancedToken 地址:", advancedToken.address);

    // 保存部署信息到文件
    // 引入Node.js的fs模块，用于文件操作
    const fs = require("fs");
    // 创建部署信息对象
    const deploymentInfo = {
        network: "hardhat",                  // 部署网络
        timestamp: new Date().toISOString(),  // 部署时间戳
        deployer: deployer.address,           // 部署者地址
        contracts: {                          // 部署的合约信息
            AdvancedToken: advancedToken.address  // AdvancedToken合约地址
        }
    };

    // 将部署信息写入deployment.json文件
    fs.writeFileSync(
        "deployment.json",                  // 文件路径
        JSON.stringify(deploymentInfo, null, 2)  // 将对象转换为格式化的JSON字符串
    );

    // 打印部署完成信息
    console.log("\n✅ 部署完成！");
    console.log("部署信息已保存到 deployment.json");
}

// 调用主函数
main()
    // 如果主函数执行成功，退出进程，退出码为0
    .then(() => process.exit(0))
    // 如果主函数执行失败，打印错误信息，退出进程，退出码为1
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });