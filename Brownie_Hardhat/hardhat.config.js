require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28", // 你的 Solidity 版本
    settings: {        // 关键：所有编译配置需放在 settings 内
      optimizer: {
        enabled: true, // 必须开启优化器（viaIR 依赖）
        runs: 200      // 优化次数（200 是通用最优值）
      },
      viaIR: true      // 启用 IR 编译模式，解决栈深度问题
    }
  }
};