const hre = require("hardhat");
require("dotenv").config();

async function main() {
    // -------------------------- 核心配置：根据网络类型选择部署签名者 --------------------------
    let deployer; // 最终使用的签名者（Signer）实例
    const networkName = hre.network.name;

    // 1. 本地测试网（hardhat/localhost）：直接获取内置测试账户的签名者
    if (networkName === "hardhat" || networkName === "localhost") {
        const SPECIFIED_DEPLOYER_ADDRESS = process.env.LOCAL_DEPLOYER_ADDRESS;
        deployer = await hre.ethers.getSigner(SPECIFIED_DEPLOYER_ADDRESS);
    }
    // 2. 公网（Sepolia/主网）：通过私钥创建签名者（而非手动指定地址）
    else {
        const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
        if (!DEPLOYER_PRIVATE_KEY) {
            throw new Error("公网部署需在 .env 中配置 DEPLOYER_PRIVATE_KEY");
        }
        // 直接通过私钥创建签名者（ethers.js v6 写法）
        deployer = new hre.ethers.Wallet(DEPLOYER_PRIVATE_KEY, hre.ethers.provider);
    }

    // 部署参数配置
    const unlockTime = Math.floor(Date.now() / 1000) + 3600; // 1小时后解锁
    const deployValue = hre.ethers.parseEther("0.1"); // 转入 0.1 ETH

    console.log("========================================");
    console.log(`开始部署 Lock 合约（${networkName} 网络 - 指定地址部署）...`);
    console.log(`指定部署地址：${deployer.address}`);
    console.log(`部署参数：解锁时间=${new Date(unlockTime * 1000).toLocaleString()}, 转入ETH=${hre.ethers.formatEther(deployValue)}`);
    console.log("========================================\n");

    // -------------------------- 验证部署账户余额 --------------------------
    // 关键修复：通过 hre.ethers 引用 provider（避免未定义）
    const deployerBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("部署者当前余额：", hre.ethers.formatEther(deployerBalance), "ETH");
    console.log("========================================");

    // -------------------------- 加载合约工厂并绑定签名者 --------------------------
    // 核心修复：将签名者绑定到合约工厂，无需再传 from 参数
    const Lock = await hre.ethers.getContractFactory("Lock", deployer);

    // -------------------------- 执行合约部署（核心：删除 from 参数） --------------------------
    const lockContract = await Lock.deploy(
        unlockTime, // 合约构造函数参数
        {
            value: deployValue, // 仅保留 value，删除非法的 from 参数
            // gasLimit: 300000, // 可选：手动指定 gas 上限
        }
    );

    // 等待部署交易上链确认
    await lockContract.waitForDeployment();
    const contractAddress = await lockContract.getAddress();

    // -------------------------- 验证部署结果 --------------------------
    const deployedOwner = await lockContract.owner();
    console.log("========================================");
    console.log("✅ 合约部署成功！");
    console.log(`区块链网络：${networkName}`);
    console.log(`合约地址：${contractAddress}`);
    console.log(`合约所有者（部署者）：${deployedOwner}`);
    console.log(`是否为指定部署地址：${deployedOwner.toLowerCase() === deployer.address.toLowerCase() ? "✅ 是" : "❌ 否"}`);
    console.log("========================================\n");
}

// 错误处理
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ 部署失败！错误信息：");
        console.error(error.message);
        process.exit(1);
    });