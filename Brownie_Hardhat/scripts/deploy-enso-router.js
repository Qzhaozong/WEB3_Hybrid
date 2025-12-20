const hre = require("hardhat");

async function main() {
    console.log("开始部署 EnsoRouter 合约...");

    // 获取部署者信息
    const [deployer] = await hre.ethers.getSigners();
    console.log("部署者地址:", deployer.address);
    console.log("部署者余额:", (await deployer.provider.getBalance(deployer.address)).toString());

    // 部署 EnsoRouter 合约
    const EnsoRouter = await hre.ethers.getContractFactory("EnsoRouter");
    console.log("获取合约工厂成功");

    const ensoRouter = await EnsoRouter.deploy();
    console.log("发送部署交易");

    await ensoRouter.waitForDeployment();
    console.log("部署完成");

    // 获取合约地址
    const contractAddress = await ensoRouter.getAddress();
    console.log("EnsoRouter 合约地址:", contractAddress);

    // 获取 shortcuts 合约地址
    const shortcutsAddress = await ensoRouter.shortcuts();
    console.log("EnsoShortcuts 合约地址:", shortcutsAddress);

    // 保存部署信息
    const fs = require("fs");
    const deploymentInfo = {
        network: hre.network.name,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            EnsoRouter: contractAddress,
            EnsoShortcuts: shortcutsAddress
        }
    };

    fs.writeFileSync(
        "deployment-enso-router.json",
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("✅ 部署信息已保存到 deployment-enso-router.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("部署失败:", error);
        process.exit(1);
    });