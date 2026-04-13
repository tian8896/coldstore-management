# 迪拜大丰收冷库管理系统 - Warehouse 1
## Super Harvest Cold Store Management System - Warehouse 1

### 功能特性 Features

#### 📦 入库管理 Check In
- 集装箱号码登记
- 供应商信息
- 品名管理（支持多品名）
- 冷库选择（冷库 1 / 冷库 2）
- 托盘数量统计
- 货物件数统计
- 入库时间记录

#### 📤 出库管理 Check Out
- 按集装箱号码出库
- 支持部分出库（托盘和件数）
- 自动计算剩余库存
- 出库时间记录

#### 📊 库存统计 Statistics
- 冷库 1 / 冷库 2 分别统计
- 按供应商分类统计
- 实时库存查询
- 入库/出库记录查询

#### 👥 用户管理 User Management
- 账号登录
- 权限管理（管理员/普通用户）

### 技术栈 Tech Stack
- **前端**: HTML5 + CSS3 + JavaScript
- **数据库**: Firebase Realtime Database
- **部署**: GitHub Pages
- **认证**: Firebase Authentication

### 快速开始 Quick Start

1. **克隆项目**
```bash
git clone https://github.com/tian8896/cold-store-management.git
cd cold-store-management
```

2. **部署到 GitHub Pages**
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

3. **访问应用**
https://tian8896.github.io/cold-store-management/

### 默认账号 Default Accounts
- **管理员**: admin / admin123
- **普通用户**: user / user123

⚠️ **安全提示**: 首次登录后请立即修改密码！

### 数据结构 Data Structure

```json
{
  "csm_warehouse1": {
    "record_id": {
      "id": "unique_id",
      "cn": "集装箱号码",
      "supplier": "供应商",
      "product": "品名",
      "pallets": 10,
      "items": 100,
      "store": 1,
      "arr": "2026-03-28T20:00:00Z",
      "dep": null,
      "pallets_out": 0,
      "items_out": 0
    }
  }
}
```

### 版本历史 Version History
- v1.0 (2026-03-28) - 初始版本，基础功能完成

### 后续计划 Roadmap
- [ ] Warehouse 2 界面
- [ ] 温度监控功能
- [ ] 数据导出（CSV/Excel）
- [ ] 高级报表分析
- [ ] 移动端适配

### 开发者 Developer
QClaw AI Assistant

### 许可证 License
MIT
