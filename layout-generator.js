/**
 * DAC电路物理布局生成器 v2.3
 * DAC Circuit Layout Generator
 * 
 * 核心逻辑修正：
 * 1. 使用标准分流器 (1入口3出口)
 * 2. 构造二分级联链：
 *    - 每个分流器只使用2个出口，实现1:1分流 (即1/2, 1/2)
 *    - 一路去电池(权重位)，一路去下级分流器
 * 3. 明确标识电池入口方向
 */

class LayoutGenerator {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.cellSize = 32;
        this.grid = [];
        this.devices = [];
        this.conveyors = [];

        // 颜色定义
        this.colors = {
            bg: '#1e1e24',
            gridLine: '#2a2a35',
            splitter: '#ff4d4d',      // 红圈 - 分流器
            conveyor: '#ffcc00',      // 黄圈 - 传送带
            battery: '#00ccff',       // 蓝圈 - 电池组
            switchOn: '#00ff00',      // 开关开
            switchOff: '#555555',     // 开关关
            text: '#ffffff',
            arrow: '#ffffff'
        };
    }

    initGrid(width, height) {
        this.gridWidth = width;
        this.gridHeight = height;
        this.devices = [];
        this.conveyors = [];
    }

    placeDevice(device) {
        this.devices.push(device);
    }

    addConveyor(path, type = 'normal', color = null) {
        this.conveyors.push({ path, type, color });
    }

    generateLayout(solution) {
        if (!solution.success) return;

        const fullTimeCount = solution.fullTimeBatteries.length;
        const dacBits = solution.dacBits || 0;
        const hasOscillating = solution.oscillatingBattery !== null;

        // 计算画布尺寸
        const dacHeight = dacBits * 4 + 6;
        const fullTimeHeight = fullTimeCount * 3 + 2;
        const height = Math.max(dacHeight, fullTimeHeight, 14);
        const width = 20;

        this.initGrid(width, height);
        let deviceId = 1;

        // === 1. 长时电池组 (左侧区域) ===
        // 简单直连结构
        const ftX = 2;
        for (let i = 0; i < fullTimeCount; i++) {
            const y = 2 + i * 4;
            // 电池组
            this.placeDevice({
                id: deviceId++,
                type: 'battery',
                batteryType: 'fulltime',
                x: ftX, y: y, w: 2, h: 2,
                label: `长时#${i + 1}`
            });
            // 输入传送带
            this.addConveyor([
                { x: ftX - 2, y: y }, { x: ftX - 1, y: y }, { x: ftX, y: y } // 假设从左侧输入
            ]);
        }

        // === 2. DAC震荡电路 (右侧区域) ===
        if (hasOscillating && dacBits > 0) {
            const chainX = 8;       // 分流器链 x坐标
            const switchX = 11;     // 开关位置
            const busX = 14;        // 汇流总线 x坐标
            const batteryX = 13;    // 受控电池 x坐标 (在总线下)
            const startY = 2;

            // 绘制级联分流器链
            for (let i = 0; i < dacBits; i++) {
                const y = startY + i * 4;

                // 1. 分流器 (标准1进3出，使用2个出口)
                this.placeDevice({
                    id: deviceId++,
                    type: 'splitter',
                    x: chainX, y: y, w: 1, h: 1,
                    label: `1/${Math.pow(2, i + 1)}`,
                    isStandard: true // 标记为标准分流器
                });

                // 2. 横向分支 (权重位) -> 去往汇流总线
                // 从分流器右侧出口 -> 开关 -> 总线
                const isActive = (solution.selectedLevel & (1 << (dacBits - 1 - i))) !== 0;
                const branchColor = isActive ? this.colors.switchOn : this.colors.switchOff;

                this.addConveyor([
                    { x: chainX + 1, y: y },
                    { x: switchX, y: y },      // 开关位
                    { x: busX, y: y }          // 汇入总线点
                ], 'branch', branchColor);

                // 开关标记
                this.placeDevice({
                    id: deviceId++,
                    type: 'switch',
                    x: switchX, y: y, w: 1, h: 1,
                    state: isActive,
                    label: `Sw${i + 1}`
                });

                // 3. 纵向级联 (余流) -> 去往下一级
                // 从分流器下方出口 -> 下一级分流器上方
                if (i < dacBits - 1) {
                    this.addConveyor([
                        { x: chainX, y: y + 1 },
                        { x: chainX, y: y + 2 },
                        { x: chainX, y: y + 3 },
                        { x: chainX, y: y + 4 } // 下一级位置
                    ], 'chain');
                } else {
                    // 最后一级余流 -> 回流
                    this.addConveyor([
                        { x: chainX, y: y + 1 },
                        { x: chainX, y: y + 2 },
                        { x: chainX - 1, y: y + 2 } // 回流示意
                    ], 'return');
                }
            }

            // 4. 汇流总线 (垂直向下)
            const busStartY = startY;
            const busEndY = startY + (dacBits - 1) * 4;

            // 绘制总线竖线
            this.addConveyor([
                { x: busX, y: busStartY },
                { x: busX, y: busEndY + 2 } // 延伸到底部电池
            ], 'bus');

            // 5. 受控电池组
            // 位于总线底部，总线接入其上方入口
            const targetBatteryY = busEndY + 3;

            this.placeDevice({
                id: deviceId++,
                type: 'battery',
                batteryType: 'oscillating',
                x: batteryX, y: targetBatteryY, w: 2, h: 2,
                label: '震荡电池',
                inputs: ['top-right'] // 标记入口位置
            });

            // 连接总线到电池入口 (假设入口在电池组右上角 [1,0] 相对位置)
            this.addConveyor([
                { x: busX, y: busEndY + 2 },
                { x: busX, y: targetBatteryY } // 接入电池右上角
            ], 'feed');
        }

        this.resizeCanvas();
    }

    resizeCanvas() {
        const padding = 20;
        const width = this.gridWidth * this.cellSize + padding * 2;
        const height = this.gridHeight * this.cellSize + padding * 2;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.ctx.scale(dpr, dpr);
    }

    render() {
        const padding = 20;
        const ctx = this.ctx;
        const cellSize = this.cellSize;

        // 背景
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 网格
        ctx.strokeStyle = this.colors.gridLine;
        ctx.lineWidth = 1;
        for (let x = 0; x <= this.gridWidth; x++) {
            ctx.beginPath(); ctx.moveTo(padding + x * cellSize, padding); ctx.lineTo(padding + x * cellSize, padding + this.gridHeight * cellSize); ctx.stroke();
        }
        for (let y = 0; y <= this.gridHeight; y++) {
            ctx.beginPath(); ctx.moveTo(padding, padding + y * cellSize); ctx.lineTo(padding + this.gridWidth * cellSize, padding + y * cellSize); ctx.stroke();
        }

        // 传送带
        this.conveyors.forEach(c => {
            const color = c.color || this.colors.conveyor;

            if (c.type === 'bus') {
                // 绘制总线长条
                const p1 = c.path[0];
                const p2 = c.path[c.path.length - 1];
                const x = padding + p1.x * cellSize + 10;
                const y = padding + p1.y * cellSize + 10;
                const w = (p2.x - p1.x) * cellSize || 12;
                const h = (p2.y - p1.y) * cellSize || 12;

                ctx.fillStyle = color;
                ctx.fillRect(x, y, w, h);
                return; // 简化处理
            }

            // 绘制路径点
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;

            // 使用简化的连线绘制
            if (c.path.length > 1) {
                ctx.beginPath();
                const start = c.path[0];
                ctx.moveTo(padding + start.x * cellSize + cellSize / 2, padding + start.y * cellSize + cellSize / 2);
                for (let i = 1; i < c.path.length; i++) {
                    const p = c.path[i];
                    ctx.lineTo(padding + p.x * cellSize + cellSize / 2, padding + p.y * cellSize + cellSize / 2);
                }
                ctx.stroke();
            }

            // 绘制黄色节点（模仿图片）
            c.path.forEach(p => {
                const x = padding + p.x * cellSize + 4;
                const y = padding + p.y * cellSize + 4;
                const s = cellSize - 8;
                ctx.strokeRect(x, y, s, s);
            });
        });

        // 设备
        this.devices.forEach(d => {
            const x = padding + d.x * cellSize;
            const y = padding + d.y * cellSize;
            const w = d.w * cellSize;
            const h = d.h * cellSize;

            if (d.type === 'switch') {
                // 绘制开关
                ctx.fillStyle = d.state ? this.colors.switchOn : this.colors.switchOff;
                ctx.fillRect(x + 4, y + 8, w - 8, h - 16);
                ctx.fillStyle = '#000';
                ctx.font = '10px Arial';
                ctx.fillText(d.state ? 'ON' : 'OFF', x + w / 2, y + h / 2 + 3);
                return;
            }

            // 边框颜色
            let borderColor = '#fff';
            if (d.type === 'splitter') borderColor = this.colors.splitter;
            if (d.type === 'battery') borderColor = this.colors.battery;

            // 绘制边框
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

            // 标签
            ctx.fillStyle = this.colors.text;
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(d.label || '', x + w / 2, y + h / 2 + 4);

            // 绘制分流器出口标记 (1下1右)
            if (d.type === 'splitter') {
                ctx.fillStyle = '#ffaaaa';
                // 右出口
                this.drawSmallArrow(ctx, x + w - 2, y + h / 2, 'right');
                // 下出口
                this.drawSmallArrow(ctx, x + w / 2, y + h - 2, 'down');
            }

            // 绘制电池组入口标记
            if (d.type === 'battery') {
                ctx.fillStyle = '#00ffaa';
                // 假设顶部有两个入口
                this.drawSmallArrow(ctx, x + w / 4, y + 2, 'down'); // 左入口
                this.drawSmallArrow(ctx, x + w * 3 / 4, y + 2, 'down'); // 右入口

                ctx.font = '9px Arial';
                ctx.fillText('IN', x + w / 4, y + 12);
                ctx.fillText('IN', x + w * 3 / 4, y + 12);
            }
        });
    }

    drawSmallArrow(ctx, x, y, dir) {
        ctx.beginPath();
        const s = 4;
        if (dir === 'right') {
            ctx.moveTo(x, y); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s, y + s);
        } else if (dir === 'down') {
            ctx.moveTo(x, y); ctx.lineTo(x - s, y - s); ctx.lineTo(x + s, y - s);
        }
        ctx.fill();
    }

    draw(solution) {
        this.generateLayout(solution);
        this.render();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LayoutGenerator;
}
