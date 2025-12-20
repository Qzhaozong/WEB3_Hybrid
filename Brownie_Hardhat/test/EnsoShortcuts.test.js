// 导入测试方法和fixture测试夹具
const { expect } = require('chai');      // 导入chai的expect断言库
const { ethers } = require('hardhat');   // 导入hardhat的ethers库，用于与以太坊交互
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");  // 导入loadFixture函数，用于创建可复用的测试环境

// 定义一个fixture来部署合约和测试代币
// Fixture是一个可以复用的测试环境，每次调用loadFixture都会重置状态
async function deployEnsoRouterFixture() {
    // 获取EnsoRouter合约工厂
    const EnsoRouter = await ethers.getContractFactory('EnsoRouter');

    // 部署测试用的ERC20代币 - 使用本地合约文件
    const TestERC20 = await ethers.getContractFactory('TestERC20');
    const testERC20 = await TestERC20.deploy("Test ERC20", "TST");  // 部署ERC20代币，名称为"Test ERC20"，符号为"TST"
    await testERC20.waitForDeployment();  // 等待合约部署完成

    // 部署测试用的ERC721代币 - 使用本地合约文件
    const TestERC721 = await ethers.getContractFactory('TestERC721');
    const testERC721 = await TestERC721.deploy("Test ERC721", "TST721");  // 部署ERC721代币，名称为"Test ERC721"，符号为"TST721"
    await testERC721.waitForDeployment();  // 等待合约部署完成

    // 部署测试用的ERC1155代币 - 使用本地合约文件
    const TestERC1155 = await ethers.getContractFactory('TestERC1155');
    const testERC1155 = await TestERC1155.deploy("https://example.com/{id}.json");  // 部署ERC1155代币，设置元数据URI
    await testERC1155.waitForDeployment();  // 等待合约部署完成

    // 部署EnsoRouter合约
    const ensoRouter = await EnsoRouter.deploy();
    await ensoRouter.waitForDeployment();  // 等待合约部署完成

    // 获取测试账户
    // ethers.getSigners()返回测试网络中的账户列表，默认第一个是owner
    const [owner, addr1, addr2] = await ethers.getSigners();

    // 为测试账户提供ERC20代币
    await testERC20.mint(await owner.getAddress(), ethers.parseEther("1000"));  // 向owner账户铸造1000个ERC20代币
    await testERC20.mint(await addr1.getAddress(), ethers.parseEther("1000"));  // 向addr1账户铸造1000个ERC20代币

    // 为测试账户提供ERC721代币
    await testERC721.mint(await owner.getAddress(), 1);  // 向owner账户铸造ID为1的ERC721代币
    await testERC721.mint(await addr1.getAddress(), 2);  // 向addr1账户铸造ID为2的ERC721代币

    // 为测试账户提供ERC1155代币
    await testERC1155.mint(await owner.getAddress(), 1, 100, "0x");  // 向owner账户铸造100个ID为1的ERC1155代币
    await testERC1155.mint(await addr1.getAddress(), 2, 200, "0x");  // 向addr1账户铸造200个ID为2的ERC1155代币

    // 返回部署的合约和账户，供测试用例使用
    return {
        ensoRouter,  // EnsoRouter合约实例
        testERC20,   // ERC20测试代币实例
        testERC721,  // ERC721测试代币实例
        testERC1155, // ERC1155测试代币实例
        owner,       // 合约部署者账户
        addr1,       // 测试账户1
        addr2        // 测试账户2
    };
}

// 开始测试套件，描述EnsoRouter合约的测试
describe('EnsoRouter 合约测试', function () {
    // 合约部署测试子套件
    describe('合约部署测试', function () {
        // 测试用例：应该正确部署EnsoRouter合约
        it('应该正确部署EnsoRouter合约', async function () {
            // 加载fixture，获取部署的合约
            const { ensoRouter } = await loadFixture(deployEnsoRouterFixture);
            // 验证合约地址是否为字符串类型
            expect(await ensoRouter.getAddress()).to.be.a('string');
            // 验证合约地址是否符合以太坊地址格式
            expect(await ensoRouter.getAddress()).to.match(/^0x[a-fA-F0-9]{40}$/);
        });

        // 测试用例：应该正确设置shortcuts合约地址
        it('应该正确设置shortcuts合约地址', async function () {
            // 加载fixture，获取部署的合约
            const { ensoRouter } = await loadFixture(deployEnsoRouterFixture);
            // 获取shortcuts合约地址
            const shortcutsAddr = await ensoRouter.shortcuts();
            // 验证shortcuts合约地址是否为字符串类型
            expect(shortcutsAddr).to.be.a('string');
            // 验证shortcuts合约地址是否符合以太坊地址格式
            expect(shortcutsAddr).to.match(/^0x[a-fA-F0-9]{40}$/);
        });
    });

    // routeSingle函数测试子套件
    describe('routeSingle 函数测试', function () {
        // 测试用例：应该能够正确路由ERC20代币
        it('应该能够正确路由ERC20代币', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC20, owner } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用ERC20代币
            const amount = ethers.parseEther("100");  // 定义要转移的代币数量：100
            await testERC20.approve(await ensoRouter.getAddress(), amount);  // 授权EnsoRouter合约使用指定数量的ERC20代币

            // 构建tokenIn参数
            const tokenIn = {
                tokenType: 1,  // 代币类型：1表示ERC20
                // 编码代币地址和数量
                data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), amount])
            };

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 执行routeSingle函数
            await ensoRouter.routeSingle(tokenIn, data);

            // 验证代币是否已转移到shortcuts合约
            const shortcutsAddr = await ensoRouter.shortcuts();  // 获取shortcuts合约地址
            const shortcutsBalance = await testERC20.balanceOf(shortcutsAddr);  // 获取shortcuts合约的ERC20余额
            expect(shortcutsBalance).to.equal(amount);  // 验证余额是否等于转移的数量
        });

        // 测试用例：应该能够正确路由原生代币（ETH）
        it('应该能够正确路由原生代币', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, owner } = await loadFixture(deployEnsoRouterFixture);

            // 构建tokenIn参数
            const amount = ethers.parseEther("1");  // 定义要转移的ETH数量：1 ETH
            const tokenIn = {
                tokenType: 0,  // 代币类型：0表示原生代币（ETH）
                data: ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [amount])  // 编码代币数量
            };

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 执行routeSingle函数，并发送指定数量的ETH
            await ensoRouter.routeSingle(tokenIn, data, { value: amount });

            // 验证原生代币是否已转移到shortcuts合约
            const shortcutsAddr = await ensoRouter.shortcuts();  // 获取shortcuts合约地址
            const shortcutsBalance = await ethers.provider.getBalance(shortcutsAddr);  // 获取shortcuts合约的ETH余额
            expect(shortcutsBalance).to.equal(amount);  // 验证余额是否等于转移的数量
        });

        // 测试用例：应该能够正确路由ERC721代币
        it('应该能够正确路由ERC721代币', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC721, owner } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用ERC721代币
            await testERC721.approve(await ensoRouter.getAddress(), 1);  // 授权EnsoRouter合约使用ID为1的ERC721代币

            // 构建tokenIn参数
            const tokenIn = {
                tokenType: 2,  // 代币类型：2表示ERC721
                // 编码代币地址和ID
                data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC721.getAddress(), 1])
            };

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 执行routeSingle函数
            await ensoRouter.routeSingle(tokenIn, data);

            // 验证ERC721代币是否已转移到shortcuts合约
            const shortcutsAddr = await ensoRouter.shortcuts();  // 获取shortcuts合约地址
            const ownerOfToken = await testERC721.ownerOf(1);  // 获取ID为1的ERC721代币的所有者
            expect(ownerOfToken).to.equal(shortcutsAddr);  // 验证所有者是否为shortcuts合约
        });

        // 测试用例：应该能够正确路由ERC1155代币
        it('应该能够正确路由ERC1155代币', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC1155, owner } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用ERC1155代币（批量授权）
            await testERC1155.setApprovalForAll(await ensoRouter.getAddress(), true);  // 授权EnsoRouter合约使用所有ERC1155代币

            // 构建tokenIn参数
            const amount = 10;  // 定义要转移的代币数量：10
            const tokenIn = {
                tokenType: 3,  // 代币类型：3表示ERC1155
                // 编码代币地址、ID和数量
                data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'uint256'], [await testERC1155.getAddress(), 1, amount])
            };

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 执行routeSingle函数
            await ensoRouter.routeSingle(tokenIn, data);

            // 验证ERC1155代币是否已转移到shortcuts合约
            const shortcutsAddr = await ensoRouter.shortcuts();  // 获取shortcuts合约地址
            const shortcutsBalance = await testERC1155.balanceOf(shortcutsAddr, 1);  // 获取shortcuts合约的ID为1的ERC1155代币余额
            expect(shortcutsBalance).to.equal(amount);  // 验证余额是否等于转移的数量
        });
    });

    // routeMulti函数测试子套件
    describe('routeMulti 函数测试', function () {
        // 测试用例：应该能够正确路由多种代币类型
        it('应该能够正确路由多种代币类型', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC20, testERC721, owner } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用ERC20和ERC721代币
            const erc20Amount = ethers.parseEther("100");  // 定义要转移的ERC20代币数量：100
            await testERC20.approve(await ensoRouter.getAddress(), erc20Amount);  // 授权EnsoRouter合约使用指定数量的ERC20代币
            await testERC721.approve(await ensoRouter.getAddress(), 1);  // 授权EnsoRouter合约使用ID为1的ERC721代币

            // 构建tokenIn参数数组
            const tokensIn = [
                {
                    tokenType: 1,  // 代币类型：1表示ERC20
                    // 编码ERC20代币地址和数量
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), erc20Amount])
                },
                {
                    tokenType: 2,  // 代币类型：2表示ERC721
                    // 编码ERC721代币地址和ID
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC721.getAddress(), 1])
                }
            ];

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 执行routeMulti函数
            await ensoRouter.routeMulti(tokensIn, data);

            // 验证代币是否已转移到shortcuts合约
            const shortcutsAddr = await ensoRouter.shortcuts();  // 获取shortcuts合约地址
            const shortcutsERC20Balance = await testERC20.balanceOf(shortcutsAddr);  // 获取shortcuts合约的ERC20余额
            const shortcutsERC721Owner = await testERC721.ownerOf(1);  // 获取ID为1的ERC721代币的所有者

            // 验证ERC20余额是否等于转移的数量
            expect(shortcutsERC20Balance).to.equal(erc20Amount);
            // 验证ERC721代币的所有者是否为shortcuts合约
            expect(shortcutsERC721Owner).to.equal(shortcutsAddr);
        });

        // 测试用例：应该拒绝重复的原生资产
        it('应该拒绝重复的原生资产', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, owner } = await loadFixture(deployEnsoRouterFixture);

            // 构建tokenIn参数数组（包含两个原生代币）
            const amount = ethers.parseEther("1");  // 定义要转移的ETH数量：1
            const tokensIn = [
                {
                    tokenType: 0,  // 代币类型：0表示原生代币（ETH）
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [amount])  // 编码代币数量
                },
                {
                    tokenType: 0,  // 代币类型：0表示原生代币（ETH）- 重复
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [amount])  // 编码代币数量
                }
            ];

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 验证是否会抛出DuplicateNativeAsset错误
            await expect(
                ensoRouter.routeMulti(tokensIn, data, { value: amount * BigInt(2) })  // 发送两倍的ETH
            ).to.be.revertedWithCustomError(ensoRouter, 'DuplicateNativeAsset');  // 期望交易被回滚并抛出DuplicateNativeAsset错误
        });

        // 测试用例：应该能够同时路由ERC20、ERC721和ERC1155代币
        it('应该能够同时路由ERC20、ERC721和ERC1155代币', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC20, testERC721, testERC1155, owner } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用所有代币
            const erc20Amount = ethers.parseEther("50");  // 定义要转移的ERC20代币数量：50
            await testERC20.approve(await ensoRouter.getAddress(), erc20Amount);  // 授权EnsoRouter合约使用指定数量的ERC20代币
            await testERC721.approve(await ensoRouter.getAddress(), 1);  // 授权EnsoRouter合约使用ID为1的ERC721代币
            await testERC1155.setApprovalForAll(await ensoRouter.getAddress(), true);  // 授权EnsoRouter合约使用所有ERC1155代币

            // 构建tokenIn参数数组
            const tokensIn = [
                {
                    tokenType: 1,  // 代币类型：1表示ERC20
                    // 编码ERC20代币地址和数量
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), erc20Amount])
                },
                {
                    tokenType: 2,  // 代币类型：2表示ERC721
                    // 编码ERC721代币地址和ID
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC721.getAddress(), 1])
                },
                {
                    tokenType: 3,  // 代币类型：3表示ERC1155
                    // 编码ERC1155代币地址、ID和数量
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'uint256'], [await testERC1155.getAddress(), 1, 15])
                }
            ];

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 执行routeMulti函数
            await ensoRouter.routeMulti(tokensIn, data);

            // 验证所有代币是否已转移到shortcuts合约
            const shortcutsAddr = await ensoRouter.shortcuts();  // 获取shortcuts合约地址

            // 获取各代币在shortcuts合约中的余额或所有者
            const shortcutsERC20Balance = await testERC20.balanceOf(shortcutsAddr);
            const shortcutsERC721Owner = await testERC721.ownerOf(1); 5
            const shortcutsERC1155Balance = await testERC1155.balanceOf(shortcutsAddr, 1);

            // 验证ERC20余额是否等于转移的数量
            expect(shortcutsERC20Balance).to.equal(erc20Amount);
            // 验证ERC721代币的所有者是否为shortcuts合约
            expect(shortcutsERC721Owner).to.equal(shortcutsAddr);
            // 验证ERC1155余额是否等于转移的数量
            expect(shortcutsERC1155Balance).to.equal(15);
        });
    });

    // safeRouteSingle函数测试子套件
    describe('safeRouteSingle 函数测试', function () {
        it('应该验证输出代币数量是否达到最小要求', async function () {
            const { ensoRouter, testERC20, owner, addr1 } = await loadFixture(deployEnsoRouterFixture);

            // 1. 实际将代币转移到EnsoRouter合约
            const inputAmount = ethers.parseEther("100");

            // 先转移代币到EnsoRouter
            await testERC20.transfer(await ensoRouter.getAddress(), inputAmount);

            // 或者使用approve + transferFrom模式（如果合约支持）
            await testERC20.approve(await ensoRouter.getAddress(), inputAmount);

            // 2. 正确构建tokenIn参数（使用实际输入数量）
            const tokenIn = {
                tokenType: 1,  // ERC20
                data: ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'uint256'],
                    [await testERC20.getAddress(), inputAmount]  // 使用实际数量
                )
            };

            // 3. 构建tokenOut参数
            const minAmountOut = ethers.parseEther("40");
            const tokenOut = {
                tokenType: 1,
                data: ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'uint256'],
                    [await testERC20.getAddress(), minAmountOut],
                    console.log([await testERC20.getAddress(), minAmountOut]),

                )
            };
            console.log("2.tokenIn.data:", tokenIn.data);
            console.log("tokenIn.data 长度:", tokenIn.data.length, '字符');
            console.log("解码验证：", ethers.AbiCoder.defaultAbiCoder().decode(['address', 'uint256'], tokenIn.data))


            // 4. 获取shortcuts合约地址并转账
            const shortcutsAddr = await ensoRouter.shortcuts();
            await testERC20.transfer(shortcutsAddr, ethers.parseEther("50"));

            // // 5. 构建转账命令
            // const transferAmount = ethers.parseEther("50");
            // const transferSelector = testERC20.interface.getFunction('transfer').selector;
            // const transferData = ethers.concat([
            //     transferSelector,
            //     ethers.AbiCoder.defaultAbiCoder().encode(
            //         ['address', 'uint256'],
            //         [await addr1.getAddress(), transferAmount]
            //     )
            // ]);

            // // 6. 构建command
            // const FLAG_CT_CALL = 0x10000000;
            // const FLAG_DATA = 0x10000;
            // const flags = FLAG_CT_CALL | FLAG_DATA;
            // const testERC20Address = await testERC20.getAddress();

            // const commands = ethers.AbiCoder.defaultAbiCoder().encode(
            //     ['uint32', 'address', 'uint256', 'uint32', 'uint32'],
            //     [flags, testERC20Address, 0, 0, transferData.length]
            // );




            // // 5. 构建转账命令
            const transferAmount = ethers.parseEther("50");
            const transferSelector = testERC20.interface.getFunction('transfer').selector;
            const transferData = ethers.concat([
                transferSelector,
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'uint256'],
                    [await addr1.getAddress(), transferAmount]
                )
            ]);

            console.log("transferData 字节长度:", (transferData.length - 2) / 2);

            // 修正：构建32字节的commands
            const commands = "0x" +
                ethers.zeroPadValue(ethers.toBeHex(flags), 4).slice(2) +
                testERC20Address.slice(2).toLowerCase() +
                "00000000" + // offset = 0 (8个十六进制字符 = 4字节)
                ethers.zeroPadValue(ethers.toBeHex((transferData.length - 2) / 2), 4).slice(2);

            console.log("commands (32字节):", commands);
            console.log("验证长度:", commands.length === 66 ? "✅ 正确" : "❌ 错误");

            // 验证这是有效的 bytes32
            try {
                const testEncode = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32'],
                    [commands]
                );
                console.log("✅ commands 是有效的 bytes32");
            } catch (error) {
                console.error("❌ commands 不是有效的 bytes32:", error.message);
            }

            // 7. 构建data参数
            const data = ethers.concat([
                ethers.id("executeShortcut(bytes32,bytes32,bytes32[],bytes[])").slice(0, 10),
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'bytes32', 'bytes32[]', 'bytes[]'],
                    [
                        ethers.ZeroHash,
                        ethers.ZeroHash,
                        [commands],
                        [transferData]
                    ]
                )
            ]);

            // 8. 执行safeRouteSingle
            await ensoRouter.safeRouteSingle(tokenIn, tokenOut, await addr1.getAddress(), data);

            // 9. 验证结果
            const addr1Balance = await testERC20.balanceOf(await addr1.getAddress());
            console.log(minAmountOut);

            expect(addr1Balance).to.be.at.least(minAmountOut);
        });

        // 测试用例：应该在输出代币数量不足时回滚
        it('应该在输出代币数量不足时回滚', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC20, owner, addr1 } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用ERC20代币
            const inputAmount = ethers.parseEther("100");  // 定义要授权的代币数量：100
            await testERC20.approve(await ensoRouter.getAddress(), inputAmount);  // 授权EnsoRouter合约使用指定数量的ERC20代币

            // 构建tokenIn参数
            const tokenIn = {
                tokenType: 1,  // 代币类型：1表示ERC20
                // 编码代币地址和数量
                data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), inputAmount])
            };

            // 构建tokenOut参数（期望获得至少50个ERC20代币）
            const minAmountOut = ethers.parseEther("50");  // 定义最小输出代币数量：50
            const tokenOut = {
                tokenType: 1,  // 代币类型：1表示ERC20
                // 编码代币地址和最小输出数量
                data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), minAmountOut])
            };

            // 构建空的data参数，这样shortcuts合约不会执行任何操作
            const data = "0x";

            // 执行safeRouteSingle，应该会回滚
            await expect(
                ensoRouter.safeRouteSingle(tokenIn, tokenOut, await addr1.getAddress(), data)
            ).to.be.revertedWithCustomError(ensoRouter, 'AmountTooLow');  // 期望交易被回滚并抛出AmountTooLow错误
        });
    });

    // safeRouteMulti函数测试子套件
    describe('safeRouteMulti 函数测试', function () {
        // 测试用例：应该验证多个输出代币数量是否达到最小要求
        it('应该验证多个输出代币数量是否达到最小要求', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC20, testERC1155, owner, addr1 } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用ERC20代币
            const inputAmount = ethers.parseEther("100");  // 定义要授权的代币数量：100
            await testERC20.approve(await ensoRouter.getAddress(), inputAmount);  // 授权EnsoRouter合约使用指定数量的ERC20代币

            // 构建tokenIn参数
            const tokenIn = {
                tokenType: 1,  // 代币类型：1表示ERC20
                // 编码代币地址和数量
                data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), inputAmount])
            };

            // 构建tokenOut参数数组
            const minERC20AmountOut = ethers.parseEther("20");  // 定义ERC20代币的最小输出数量：20
            const minERC1155AmountOut = 10;  // 定义ERC1155代币的最小输出数量：10
            const tokensOut = [
                {
                    tokenType: 1,  // 代币类型：1表示ERC20
                    // 编码代币地址和最小输出数量
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), minERC20AmountOut])
                },
                {
                    tokenType: 3,  // 代币类型：3表示ERC1155
                    // 编码代币地址、ID和最小输出数量
                    data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'uint256'], [await testERC1155.getAddress(), 1, minERC1155AmountOut])
                }
            ];

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 先向shortcuts合约发送一些代币
            const shortcutsAddr = await ensoRouter.shortcuts();  // 获取shortcuts合约地址
            await testERC20.transfer(shortcutsAddr, ethers.parseEther("25"));  // 向shortcuts合约转移25个ERC20代币
            await testERC1155.mint(shortcutsAddr, 1, 15, "0x");  // 向shortcuts合约铸造15个ID为1的ERC1155代币

            // 执行safeRouteMulti
            await ensoRouter.safeRouteMulti([tokenIn], tokensOut, await addr1.getAddress(), data);

            // 验证输出代币是否达到最小要求
            // 获取addr1的ERC20代币余额
            const addr1ERC20Balance = await testERC20.balanceOf(await addr1.getAddress());
            // 获取addr1的ID为1的ERC1155代币余额
            const addr1ERC1155Balance = await testERC1155.balanceOf(await addr1.getAddress(), 1);

            // 验证ERC20余额是否至少为最小输出数量
            expect(addr1ERC20Balance).to.be.at.least(minERC20AmountOut);
            // 验证ERC1155余额是否至少为最小输出数量
            expect(addr1ERC1155Balance).to.be.at.least(minERC1155AmountOut);
        });
    });

    // 错误处理测试子套件
    describe('错误处理测试', function () {
        // 测试用例：应该拒绝不支持的代币类型
        it('应该拒绝不支持的代币类型', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, owner } = await loadFixture(deployEnsoRouterFixture);

            // 构建不支持的代币类型参数
            const tokenIn = {
                tokenType: 4,  // 代币类型：4表示不支持的代币类型
                data: "0x"
            };

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 验证是否会抛出UnsupportedTokenType错误
            await expect(
                ensoRouter.routeSingle(tokenIn, data)
            ).to.be.revertedWithCustomError(ensoRouter, 'UnsupportedTokenType');  // 期望交易被回滚并抛出UnsupportedTokenType错误
        });

        // 测试用例：应该在msg.value与预期金额不匹配时回滚
        it('应该在msg.value与预期金额不匹配时回滚', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, owner } = await loadFixture(deployEnsoRouterFixture);

            // 构建tokenIn参数
            const expectedAmount = ethers.parseEther("1");  // 定义预期的ETH数量：1
            const tokenIn = {
                tokenType: 0,  // 代币类型：0表示原生代币（ETH）
                // 编码预期的ETH数量
                data: ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [expectedAmount])
            };

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 发送错误的金额
            const wrongAmount = ethers.parseEther("2");  // 定义错误的ETH数量：2

            // 验证是否会抛出WrongMsgValue错误
            await expect(
                ensoRouter.routeSingle(tokenIn, data, { value: wrongAmount })  // 发送错误的ETH数量
            ).to.be.revertedWithCustomError(ensoRouter, 'WrongMsgValue');  // 期望交易被回滚并抛出WrongMsgValue错误
        });

        // 测试用例：应该在提供非原生代币时拒绝msg.value
        it('应该在提供非原生代币时拒绝msg.value', async function () {
            // 加载fixture，获取部署的合约和账户
            const { ensoRouter, testERC20, owner } = await loadFixture(deployEnsoRouterFixture);

            // 授权EnsoRouter使用ERC20代币
            const amount = ethers.parseEther("100");  // 定义要转移的ERC20代币数量：100
            await testERC20.approve(await ensoRouter.getAddress(), amount);  // 授权EnsoRouter合约使用指定数量的ERC20代币

            // 构建tokenIn参数（ERC20）
            const tokenIn = {
                tokenType: 1,  // 代币类型：1表示ERC20
                // 编码代币地址和数量
                data: ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await testERC20.getAddress(), amount])
            };

            // 构建简单的测试数据（空数据）
            const data = "0x";

            // 发送额外的msg.value
            const extraValue = ethers.parseEther("1");  // 定义额外的ETH数量：1

            // 验证是否会抛出WrongMsgValue错误
            await expect(
                ensoRouter.routeSingle(tokenIn, data, { value: extraValue })  // 发送额外的ETH
            ).to.be.revertedWithCustomError(ensoRouter, 'WrongMsgValue');  // 期望交易被回滚并抛出WrongMsgValue错误
        });
    });
});