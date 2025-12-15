# WEB3_Hybrid
# 创建venv环境
python3 -m venv venv
# 激活环境
# 后期直接修改venv目录为.venv
source venv/bin/activate
# 退出环境
deactivate
# 安装依赖
pip install -r ./requirements.txt


# Brownie 环境安装
# 查看当前brownie版本，验证安装是否正常
brownie --version  
# Brownie环境初始化
brownie init 
# brownie框架结构
WEB3_Hybrid/
├── .gitignore
├── brownie/
│   ├── .venv/           # Brownie 虚拟环境
│   ├── contracts/
│   ├── scripts/
│   ├── tests/
│   └── requirements.txt
├── hardhat/
│   ├── node_modules/    # Node.js 依赖
│   ├── contracts/
│   └── package.json
├── shared/
└── scripts/
    ├── setup-venv.sh    # 环境设置脚本
    └── activate.sh      # 激活脚本