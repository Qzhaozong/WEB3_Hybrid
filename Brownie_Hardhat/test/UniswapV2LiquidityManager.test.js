// test/UniswapV2LiquidityManager.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("UniswapV2LiquidityManager", function () {
    // 合约实例
    let LiquidityManager;
    let liquidityManager;

    // 代币实例
    let TokenA;
    let tokenA;
    let TokenB;
    let tokenB;
    let WETH;
    let weth;

    // Uniswap 模拟实例
    let MockFactory;
    let mockFactory;
    let MockRouter;
    let mockRouter;
    let MockPair;
    let mockPair;

    // 测试账户
    let owner;
    let user1;
    let user2;
    let addrs;

    // 测试常量
    // 测试常量（延迟解析，避免模块加载时使用未定义的 ethers）
    const INITIAL_SUPPLY_STR = "1000000";
    const LIQUIDITY_AMOUNT_STR = "100";
    const SMALL_AMOUNT_STR = "10";
    let INITIAL_SUPPLY;
    let LIQUIDITY_AMOUNT;
    let SMALL_AMOUNT;
    let DEADLINE; // 在 beforeEach 中设置

    // 兼容 ethers v5/v6 的 parseEther 辅助（可在任意位置调用）
    function parseEther(amountStr) {
        if (ethers.utils && typeof ethers.utils.parseEther === "function") {
            return ethers.utils.parseEther(amountStr);
        }
        if (typeof ethers.parseEther === "function") {
            return ethers.parseEther(amountStr);
        }
        throw new Error("parseEther is not available on ethers");
    }

    // 部署 mock 合约的辅助函数
    async function deployMockContracts() {
        // 部署 ERC20 测试代币
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        TokenA = await ERC20Mock.deploy("TokenA", "TA", owner.address, INITIAL_SUPPLY);
        await TokenA.deployed();
        tokenA = TokenA;

        TokenB = await ERC20Mock.deploy("TokenB", "TB", owner.address, INITIAL_SUPPLY);
        await TokenB.deployed();
        tokenB = TokenB;

        WETH = await ERC20Mock.deploy("WETH", "WETH", owner.address, INITIAL_SUPPLY);
        await WETH.deployed();
        weth = WETH;

        // 部署 Uniswap 模拟合约
        MockFactory = await ethers.getContractFactory("MockUniswapV2Factory");
        mockFactory = await MockFactory.deploy();
        await mockFactory.deployed();

        MockPair = await ethers.getContractFactory("MockUniswapV2Pair");
        mockPair = await MockPair.deploy(tokenA.address, tokenB.address);
        await mockPair.deployed();

        // 设置工厂返回配对地址
        await mockFactory.setPair(tokenA.address, tokenB.address, mockPair.address);

        MockRouter = await ethers.getContractFactory("MockUniswapV2Router");
        mockRouter = await MockRouter.deploy(
            mockFactory.address,
            weth.address
        );
        await mockRouter.deployed();

        // 设置 Router 返回模拟的流动性
        await mockRouter.setAddLiquidityReturns(
            LIQUIDITY_AMOUNT.div(2),
            LIQUIDITY_AMOUNT.div(2),
            LIQUIDITY_AMOUNT
        );
        await mockRouter.setRemoveLiquidityReturns(
            LIQUIDITY_AMOUNT.div(2),
            LIQUIDITY_AMOUNT.div(2)
        );
    }

    beforeEach(async function () {
        // 获取签名者
        [owner, user1, user2, ...addrs] = await ethers.getSigners();

        // 解析测试常量（在 Hardhat 环境中使用 ethers）
        INITIAL_SUPPLY = parseEther(INITIAL_SUPPLY_STR);
        LIQUIDITY_AMOUNT = parseEther(LIQUIDITY_AMOUNT_STR);
        SMALL_AMOUNT = parseEther(SMALL_AMOUNT_STR);
        DEADLINE = Math.floor(Date.now() / 1000) + 3600; // 1小时后

        // 部署模拟合约
        await deployMockContracts();

        // 部署主合约
        const LiquidityManagerFactory = await ethers.getContractFactory(
            "UniswapV2LiquidityManager"
        );
        LiquidityManager = await LiquidityManagerFactory.deploy(
            mockFactory.address,
            mockRouter.address,
            weth.address
        );
        await LiquidityManager.deployed();
        liquidityManager = LiquidityManager;

        // 给用户分配代币
        await tokenA.transfer(user1.address, INITIAL_SUPPLY.div(10));
        await tokenB.transfer(user1.address, INITIAL_SUPPLY.div(10));
        await tokenA.transfer(user2.address, INITIAL_SUPPLY.div(10));
        await tokenB.transfer(user2.address, INITIAL_SUPPLY.div(10));

        // 用户授权给流动性管理器
        await tokenA.connect(user1).approve(
            liquidityManager.address,
            ethers.constants.MaxUint256
        );
        await tokenB.connect(user1).approve(
            liquidityManager.address,
            ethers.constants.MaxUint256
        );

        // 给配对合约分配 LP 代币（用于模拟）
        const MockLPToken = await ethers.getContractFactory("ERC20Mock");
        const mockLPToken = await MockLPToken.deploy(
            "LP Token",
            "LP",
            mockPair.address,
            INITIAL_SUPPLY
        );
        await mockLPToken.deployed();
        await mockPair.setToken(mockLPToken.address);
    });

    describe("构造函数", function () {
        it("应该正确设置合约地址", async function () {
            expect(await liquidityManager.factory()).to.equal(mockFactory.address);
            expect(await liquidityManager.router()).to.equal(mockRouter.address);
            expect(await liquidityManager.weth()).to.equal(weth.address);
        });

        it("应该拒绝零地址参数", async function () {
            const LiquidityManagerFactory = await ethers.getContractFactory(
                "UniswapV2LiquidityManager"
            );

            // 测试零地址工厂
            await expect(
                LiquidityManagerFactory.deploy(
                    ethers.constants.AddressZero,
                    mockRouter.address,
                    weth.address
                )
            ).to.be.revertedWith("Invalid: zero token address");

            // 测试零地址路由器
            await expect(
                LiquidityManagerFactory.deploy(
                    mockFactory.address,
                    ethers.constants.AddressZero,
                    weth.address
                )
            ).to.be.revertedWith("Invalid: zero token address");

            // 测试零地址 WETH
            await expect(
                LiquidityManagerFactory.deploy(
                    mockFactory.address,
                    mockRouter.address,
                    ethers.constants.AddressZero
                )
            ).to.be.revertedWith("Invalid: zero token address");
        });

        it("应该拒绝非合约地址", async function () {
            const LiquidityManagerFactory = await ethers.getContractFactory(
                "UniswapV2LiquidityManager"
            );

            // 使用 EOA 地址应该失败
            await expect(
                LiquidityManagerFactory.deploy(
                    user1.address, // EOA 地址，不是合约
                    mockRouter.address,
                    weth.address
                )
            ).to.be.revertedWith("Invalid: not a contract");
        });
    });

    describe("添加流动性", function () {
        it("应该成功添加流动性", async function () {
            const amountA = LIQUIDITY_AMOUNT;
            const amountB = LIQUIDITY_AMOUNT;
            const amountAMin = amountA.mul(9).div(10); // 10% 滑点容限
            const amountBMin = amountB.mul(9).div(10);

            // 记录添加前的余额
            const userTokenABalanceBefore = await tokenA.balanceOf(user1.address);
            const userTokenBBalanceBefore = await tokenB.balanceOf(user1.address);

            // 添加流动性
            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    amountA,
                    amountB,
                    amountAMin,
                    amountBMin,
                    DEADLINE
                )
            ).to.emit(liquidityManager, "LiquidityAdded")
                .withArgs(
                    user1.address,
                    tokenA.address,
                    tokenB.address,
                    amountA.div(2), // Mock 返回一半
                    amountB.div(2),
                    LIQUIDITY_AMOUNT
                );

            // 检查用户余额减少
            expect(await tokenA.balanceOf(user1.address)).to.equal(
                userTokenABalanceBefore.sub(amountA)
            );
            expect(await tokenB.balanceOf(user1.address)).to.equal(
                userTokenBBalanceBefore.sub(amountB)
            );

            // 检查 LP 余额记录
            const pairKey = ethers.utils.solidityKeccak256(
                ["address", "address"],
                [
                    tokenA.address < tokenB.address ? tokenA.address : tokenB.address,
                    tokenA.address < tokenB.address ? tokenB.address : tokenA.address,
                ]
            );
            const userLPBalance = await liquidityManager.userLPBalances(
                user1.address,
                pairKey
            );
            expect(userLPBalance).to.equal(LIQUIDITY_AMOUNT);
        });

        it("应该拒绝零金额", async function () {
            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    0,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    DEADLINE
                )
            ).to.be.revertedWith("Invalid: zero amount");

            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    LIQUIDITY_AMOUNT,
                    0,
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    DEADLINE
                )
            ).to.be.revertedWith("Invalid: zero amount");
        });

        it("应该拒绝过期的截止时间", async function () {
            const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1小时前

            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    expiredDeadline
                )
            ).to.be.revertedWith("Invalid: deadline expired");
        });

        it("应该拒绝无效的滑点设置", async function () {
            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT.mul(2), // 大于期望金额
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    DEADLINE
                )
            ).to.be.revertedWith("Invalid: minA > desiredA");

            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    LIQUIDITY_AMOUNT.mul(2), // 大于期望金额
                    DEADLINE
                )
            ).to.be.revertedWith("Invalid: minB > desiredB");
        });

        it("应该处理非标准 ERC20 代币", async function () {
            // 部署一个非标准 ERC20（无返回值）
            const NonStandardERC20 = await ethers.getContractFactory("NonStandardERC20");
            const nonStandardToken = await NonStandardERC20.deploy(
                "NonStandard",
                "NS",
                owner.address,
                INITIAL_SUPPLY
            );
            await nonStandardToken.deployed();

            // 设置 Mock 工厂返回新的配对
            const mockPair2 = await MockPair.deploy(
                nonStandardToken.address,
                tokenB.address
            );
            await mockPair2.deployed();
            await mockFactory.setPair(
                nonStandardToken.address,
                tokenB.address,
                mockPair2.address
            );

            // 分配代币并授权
            await nonStandardToken.transfer(user1.address, LIQUIDITY_AMOUNT);
            await nonStandardToken.connect(user1).approve(
                liquidityManager.address,
                ethers.constants.MaxUint256
            );

            // 应该成功添加流动性
            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    nonStandardToken.address,
                    tokenB.address,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT,
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    LIQUIDITY_AMOUNT.mul(9).div(10),
                    DEADLINE
                )
            ).to.emit(liquidityManager, "LiquidityAdded");
        });
    });

    describe("移除流动性", function () {
        beforeEach(async function () {
            // 先添加流动性
            const amountA = LIQUIDITY_AMOUNT;
            const amountB = LIQUIDITY_AMOUNT;
            const amountAMin = amountA.mul(9).div(10);
            const amountBMin = amountB.mul(9).div(10);

            await liquidityManager.connect(user1).addLiquidity(
                tokenA.address,
                tokenB.address,
                amountA,
                amountB,
                amountAMin,
                amountBMin,
                DEADLINE
            );
        });

        it("应该成功移除流动性", async function () {
            const liquidityToRemove = LIQUIDITY_AMOUNT.div(2);
            const amountAMin = liquidityToRemove.div(4); // 模拟滑点
            const amountBMin = liquidityToRemove.div(4);

            // 记录移除前的 LP 余额
            const pairKey = ethers.utils.solidityKeccak256(
                ["address", "address"],
                [
                    tokenA.address < tokenB.address ? tokenA.address : tokenB.address,
                    tokenA.address < tokenB.address ? tokenB.address : tokenA.address,
                ]
            );
            const lpBalanceBefore = await liquidityManager.userLPBalances(
                user1.address,
                pairKey
            );

            // 移除流动性
            await expect(
                liquidityManager.connect(user1).removeLiquidity(
                    tokenA.address,
                    tokenB.address,
                    liquidityToRemove,
                    amountAMin,
                    amountBMin,
                    DEADLINE
                )
            ).to.emit(liquidityManager, "LiquidityRemoved")
                .withArgs(
                    user1.address,
                    tokenA.address,
                    tokenB.address,
                    liquidityToRemove,
                    liquidityToRemove.div(2), // Mock 返回值
                    liquidityToRemove.div(2)
                );

            // 检查 LP 余额减少
            const lpBalanceAfter = await liquidityManager.userLPBalances(
                user1.address,
                pairKey
            );
            expect(lpBalanceAfter).to.equal(lpBalanceBefore.sub(liquidityToRemove));

            // 检查代币余额记录
            const tokenABalance = await liquidityManager.userTokenBalances(
                user1.address,
                tokenA.address
            );
            const tokenBBalance = await liquidityManager.userTokenBalances(
                user1.address,
                tokenB.address
            );
            expect(tokenABalance).to.equal(liquidityToRemove.div(2));
            expect(tokenBBalance).to.equal(liquidityToRemove.div(2));
        });

        it("应该拒绝不存在的配对", async function () {
            const NonExistentToken = await ethers.getContractFactory("ERC20Mock");
            const nonExistentToken = await NonExistentToken.deploy(
                "NonExistent",
                "NE",
                owner.address,
                INITIAL_SUPPLY
            );
            await nonExistentToken.deployed();

            await expect(
                liquidityManager.connect(user1).removeLiquidity(
                    nonExistentToken.address,
                    tokenB.address,
                    SMALL_AMOUNT,
                    SMALL_AMOUNT.mul(9).div(10),
                    SMALL_AMOUNT.mul(9).div(10),
                    DEADLINE
                )
            ).to.be.revertedWith("Invalid: pair not exist");
        });

        it("应该拒绝 LP 余额不足", async function () {
            const excessLiquidity = LIQUIDITY_AMOUNT.mul(2);

            await expect(
                liquidityManager.connect(user1).removeLiquidity(
                    tokenA.address,
                    tokenB.address,
                    excessLiquidity,
                    SMALL_AMOUNT,
                    SMALL_AMOUNT,
                    DEADLINE
                )
            ).to.be.revertedWith("Insufficient: LP balance");
        });

        it("应该拒绝其他用户移除他人的流动性", async function () {
            await expect(
                liquidityManager.connect(user2).removeLiquidity(
                    tokenA.address,
                    tokenB.address,
                    SMALL_AMOUNT,
                    SMALL_AMOUNT,
                    SMALL_AMOUNT,
                    DEADLINE
                )
            ).to.be.revertedWith("Insufficient: LP balance");
        });
    });

    describe("提取代币", function () {
        beforeEach(async function () {
            // 添加并移除一些流动性，生成可提取的代币
            const amountA = LIQUIDITY_AMOUNT;
            const amountB = LIQUIDITY_AMOUNT;
            const amountAMin = amountA.mul(9).div(10);
            const amountBMin = amountB.mul(9).div(10);

            await liquidityManager.connect(user1).addLiquidity(
                tokenA.address,
                tokenB.address,
                amountA,
                amountB,
                amountAMin,
                amountBMin,
                DEADLINE
            );

            await liquidityManager.connect(user1).removeLiquidity(
                tokenA.address,
                tokenB.address,
                LIQUIDITY_AMOUNT.div(2),
                SMALL_AMOUNT,
                SMALL_AMOUNT,
                DEADLINE
            );
        });

        it("应该成功提取代币", async function () {
            const withdrawAmount = LIQUIDITY_AMOUNT.div(4);

            // 记录提取前的余额
            const contractTokenABalanceBefore = await tokenA.balanceOf(
                liquidityManager.address
            );
            const userTokenABalanceBefore = await tokenA.balanceOf(user1.address);
            const recordedBalanceBefore = await liquidityManager.userTokenBalances(
                user1.address,
                tokenA.address
            );

            // 提取代币
            await expect(
                liquidityManager.connect(user1).withdrawToken(
                    tokenA.address,
                    withdrawAmount
                )
            ).to.emit(liquidityManager, "TokenWithdrawn")
                .withArgs(user1.address, tokenA.address, withdrawAmount);

            // 检查合约余额减少
            const contractTokenABalanceAfter = await tokenA.balanceOf(
                liquidityManager.address
            );
            expect(contractTokenABalanceAfter).to.equal(
                contractTokenABalanceBefore.sub(withdrawAmount)
            );

            // 检查用户余额增加
            const userTokenABalanceAfter = await tokenA.balanceOf(user1.address);
            expect(userTokenABalanceAfter).to.equal(
                userTokenABalanceBefore.add(withdrawAmount)
            );

            // 检查记录的余额减少
            const recordedBalanceAfter = await liquidityManager.userTokenBalances(
                user1.address,
                tokenA.address
            );
            expect(recordedBalanceAfter).to.equal(
                recordedBalanceBefore.sub(withdrawAmount)
            );
        });

        it("应该拒绝提取零金额", async function () {
            await expect(
                liquidityManager.connect(user1).withdrawToken(tokenA.address, 0)
            ).to.be.revertedWith("Invalid: zero amount");
        });

        it("应该拒绝提取余额不足", async function () {
            const excessAmount = LIQUIDITY_AMOUNT.mul(2);

            await expect(
                liquidityManager.connect(user1).withdrawToken(
                    tokenA.address,
                    excessAmount
                )
            ).to.be.revertedWith("Insufficient: token balance");
        });

        it("应该拒绝其他用户提取他人的代币", async function () {
            await expect(
                liquidityManager.connect(user2).withdrawToken(
                    tokenA.address,
                    SMALL_AMOUNT
                )
            ).to.be.revertedWith("Insufficient: token balance");
        });
    });

    describe("辅助函数", function () {
        it("应该正确处理代币对的排序", async function () {
            // 无论传入顺序如何，都应该生成相同的 pairKey
            const pairKeyAB = ethers.utils.solidityKeccak256(
                ["address", "address"],
                [tokenA.address, tokenB.address]
            );
            const pairKeyBA = ethers.utils.solidityKeccak256(
                ["address", "address"],
                [tokenB.address, tokenA.address]
            );

            // 内部函数无法直接测试，通过添加流动性来验证
            const amountA = SMALL_AMOUNT;
            const amountB = SMALL_AMOUNT;
            const amountAMin = amountA.mul(9).div(10);
            const amountBMin = amountB.mul(9).div(10);

            // 以 A,B 顺序添加
            await liquidityManager.connect(user1).addLiquidity(
                tokenA.address,
                tokenB.address,
                amountA,
                amountB,
                amountAMin,
                amountBMin,
                DEADLINE
            );

            // 以 B,A 顺序添加，应该更新同一个 LP 余额
            await liquidityManager.connect(user1).addLiquidity(
                tokenB.address,
                tokenA.address,
                amountA,
                amountB,
                amountAMin,
                amountBMin,
                DEADLINE
            );

            // 获取排序后的正确 key
            const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
            const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
            const correctPairKey = ethers.utils.solidityKeccak256(
                ["address", "address"],
                [token0, token1]
            );

            const lpBalance = await liquidityManager.userLPBalances(
                user1.address,
                correctPairKey
            );
            // 应该累积两次添加的流动性
            expect(lpBalance).to.equal(LIQUIDITY_AMOUNT.mul(2));
        });

        it("应该正确处理非标准代币的授权", async function () {
            // 部署一个需要先重置授权的代币（类似 USDT）
            const USDTLikeToken = await ethers.getContractFactory("USDTLikeToken");
            const usdtLikeToken = await USDTLikeToken.deploy(
                "USDT Like",
                "USDT",
                owner.address,
                INITIAL_SUPPLY
            );
            await usdtLikeToken.deployed();

            // 分配代币并授权
            await usdtLikeToken.transfer(user1.address, LIQUIDITY_AMOUNT);
            await usdtLikeToken.connect(user1).approve(
                liquidityManager.address,
                ethers.constants.MaxUint256
            );

            // 设置 Mock 工厂返回新的配对
            const mockPair2 = await MockPair.deploy(
                usdtLikeToken.address,
                tokenB.address
            );
            await mockPair2.deployed();
            await mockFactory.setPair(
                usdtLikeToken.address,
                tokenB.address,
                mockPair2.address
            );

            // 应该能够成功添加流动性（测试安全授权逻辑）
            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    usdtLikeToken.address,
                    tokenB.address,
                    SMALL_AMOUNT,
                    SMALL_AMOUNT,
                    SMALL_AMOUNT.mul(9).div(10),
                    SMALL_AMOUNT.mul(9).div(10),
                    DEADLINE
                )
            ).to.emit(liquidityManager, "LiquidityAdded");
        });
    });

    describe("边界情况", function () {
        it("应该处理最大数量的流动性操作", async function () {
            const maxAmount = ethers.constants.MaxUint256;

            // 注意：这里我们只测试合约逻辑，不实际转移这么多代币
            // 设置 Mock Router 返回合理的值
            await mockRouter.setAddLiquidityReturns(
                maxAmount.div(1000),
                maxAmount.div(1000),
                maxAmount.div(1000)
            );

            // 这个测试主要是验证合约不会在算术运算上溢出
            // 在实际测试中，我们会使用合理的数值
            const reasonableAmount = parseEther("1000");

            await expect(
                liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    reasonableAmount,
                    reasonableAmount,
                    reasonableAmount.mul(9).div(10),
                    reasonableAmount.mul(9).div(10),
                    DEADLINE
                )
            ).to.emit(liquidityManager, "LiquidityAdded");
        });

        it("应该正确处理重复的添加/移除操作", async function () {
            const amount = SMALL_AMOUNT;
            const minAmount = amount.mul(9).div(10);

            // 多次添加
            for (let i = 0; i < 3; i++) {
                await liquidityManager.connect(user1).addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    amount,
                    amount,
                    minAmount,
                    minAmount,
                    DEADLINE
                );
            }

            // 多次移除
            for (let i = 0; i < 3; i++) {
                await liquidityManager.connect(user1).removeLiquidity(
                    tokenA.address,
                    tokenB.address,
                    amount.div(3),
                    amount.div(10),
                    amount.div(10),
                    DEADLINE
                );
            }

            // 验证最终余额
            const pairKey = ethers.utils.solidityKeccak256(
                ["address", "address"],
                [
                    tokenA.address < tokenB.address ? tokenA.address : tokenB.address,
                    tokenA.address < tokenB.address ? tokenB.address : tokenA.address,
                ]
            );
            const finalLPBalance = await liquidityManager.userLPBalances(
                user1.address,
                pairKey
            );
            // 添加了 3次，移除了 3次（每次移除 1/3）
            expect(finalLPBalance).to.equal(amount.mul(2)); // 3 - 1 = 2 份
        });
    });
});