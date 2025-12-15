// scripts/deploy.js
const hre = require("hardhat");

async function main() {
    // 部署模拟合约
    const [deployer] = await hre.ethers.getSigners();
    console.log("部署者地址:", deployer.address);

    // 1. 部署测试代币
    const ERC20Mock = await hre.ethers.getContractFactory("ERC20Mock");
    const tokenA = await ERC20Mock.deploy(
        "TokenA",
        "TA",
        deployer.address,
        hre.ethers.utils.parseEther("1000000")
    );
    await tokenA.deployed();
    console.log("TokenA 地址:", tokenA.address);

    const tokenB = await ERC20Mock.deploy(
        "TokenB",
        "TB",
        deployer.address,
        hre.ethers.utils.parseEther("1000000")
    );
    await tokenB.deployed();
    console.log("TokenB 地址:", tokenB.address);

    const WETH = await ERC20Mock.deploy(
        "Wrapped Ether",
        "WETH",
        deployer.address,
        hre.ethers.utils.parseEther("1000000")
    );
    await WETH.deployed();
    console.log("WETH 地址:", WETH.address);

    // 2. 部署模拟 Uniswap 工厂
    const MockFactory = await hre.ethers.getContractFactory("MockUniswapV2Factory");
    const mockFactory = await MockFactory.deploy();
    await mockFactory.deployed();
    console.log("MockFactory 地址:", mockFactory.address);

    // 3. 部署模拟 Uniswap 路由器
    const MockRouter = await hre.ethers.getContractFactory("MockUniswapV2Router");
    const mockRouter = await MockRouter.deploy(mockFactory.address, WETH.address);
    await mockRouter.deployed();
    console.log("MockRouter 地址:", mockRouter.address);

    // 4. 部署主合约
    const LiquidityManager = await hre.ethers.getContractFactory("UniswapV2LiquidityManager");
    const liquidityManager = await LiquidityManager.deploy(
        mockFactory.address,
        mockRouter.address,
        WETH.address
    );
    await liquidityManager.deployed();
    console.log("LiquidityManager 地址:", liquidityManager.address);

    // 5. 设置模拟返回值
    const liquidityAmount = hre.ethers.utils.parseEther("100");
    await mockRouter.setAddLiquidityReturns(
        liquidityAmount.div(2),
        liquidityAmount.div(2),
        liquidityAmount
    );
    await mockRouter.setRemoveLiquidityReturns(
        liquidityAmount.div(2),
        liquidityAmount.div(2)
    );

    console.log("\n✅ 所有合约部署完成！");
    console.log("\n📋 合约地址汇总：");
    console.log("TokenA:", tokenA.address);
    console.log("TokenB:", tokenB.address);
    console.log("WETH:", WETH.address);
    console.log("MockFactory:", mockFactory.address);
    console.log("MockRouter:", mockRouter.address);
    console.log("LiquidityManager:", liquidityManager.address);

    // 保存地址到文件
    const fs = require("fs");
    const addresses = {
        tokenA: tokenA.address,
        tokenB: tokenB.address,
        weth: WETH.address,
        factory: mockFactory.address,
        router: mockRouter.address,
        liquidityManager: liquidityManager.address,
        deployer: deployer.address,
    };
    fs.writeFileSync(
        "deployment-addresses.json",
        JSON.stringify(addresses, null, 2)
    );
    console.log("\n📁 地址已保存到 deployment-addresses.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });