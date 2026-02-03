/**
 * 分流器网络可视化模块
 * Splitter Network Visualizer
 */

class SplitterVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nodeRadius = 25;
        this.levelHeight = 80;
        this.colors = {
            mainBelt: '#00d4ff',     // 青蓝色 - 主带
            splitter: '#ffe066',     // 黄色 - 分流器
            battery: '#00d4ff',      // 青蓝色 - 电池组
            return: '#9090a0',       // 灰色 - 回流
            line: '#4a4a5a',
            text: '#f0f0f5',
            textSecondary: '#9090a0'
        };
    }

    /**
     * 清空画布
     */
    clear() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.clearRect(0, 0, rect.width, rect.height);
    }

    /**
     * 绘制分流器网络
     */
    draw(solution) {
        this.clear();

        if (!solution.success || solution.batteryCount === 0) {
            this.drawMessage("基地发电已满足需求，无需分流器网络");
            return;
        }

        const width = this.canvas.getBoundingClientRect().width;
        const height = this.canvas.getBoundingClientRect().height;

        // 构建节点树
        const tree = this.buildVisualizationTree(solution);

        // 计算节点位置
        this.calculatePositions(tree, width, height);

        // 绘制连接线
        this.drawConnections(tree);

        // 绘制节点
        this.drawNodes(tree);
    }

    /**
     * 构建可视化树结构
     */
    buildVisualizationTree(solution) {
        const batteries = solution.batteries;
        const n = batteries.length;

        // 根节点 - 主带
        const root = {
            type: 'main',
            label: '主带',
            children: []
        };

        if (n === 0) {
            return root;
        }

        // 使用递归构建分流器树（确保每个分流器最多3出口）
        const batteryNodes = batteries.map((battery, idx) => this.buildBatteryBranch(battery, idx));

        // 添加回流节点
        const returnNode = {
            type: 'return',
            label: '回流',
            children: []
        };

        // 构建分流器树结构（限制每个分流器最多3出口）
        const splitterTree = this.buildSplitterTree([...batteryNodes, returnNode]);
        root.children.push(splitterTree);

        return root;
    }

    /**
     * 递归构建分流器树（确保每个分流器最多3个出口）
     */
    buildSplitterTree(nodes) {
        if (nodes.length <= 3) {
            // 可以直接用一个分流器
            const outlets = nodes.length;
            return {
                type: 'splitter',
                label: '分流器',
                outlets: outlets,
                outletsLabel: `${outlets}条分流带`,
                children: nodes
            };
        }

        // 超过3个节点，需要分组并递归
        // 策略：尽量使用3出口分流器，分成若干组
        const groups = [];
        const groupSize = 3; // 每组最多3个

        for (let i = 0; i < nodes.length; i += groupSize) {
            const group = nodes.slice(i, Math.min(i + groupSize, nodes.length));
            if (group.length === 1) {
                // 单个节点直接保留
                groups.push(group[0]);
            } else {
                // 多个节点需要子分流器
                groups.push({
                    type: 'splitter',
                    label: '分流器',
                    outlets: group.length,
                    outletsLabel: `${group.length}条分流带`,
                    children: group
                });
            }
        }

        // 递归处理分组后的结果
        if (groups.length <= 3) {
            return {
                type: 'splitter',
                label: '分流器',
                outlets: groups.length,
                outletsLabel: `${groups.length}条分流带`,
                children: groups
            };
        } else {
            return this.buildSplitterTree(groups);
        }
    }

    /**
     * 构建单个电池组分支
     */
    buildBatteryBranch(battery, index) {
        const ratio = battery.ratio;
        const depth = ratio.depth || 0;

        if (depth <= 1) {
            // 简单分支，直接连接电池组
            return {
                type: 'battery',
                label: battery.name,
                ratio: ratio.fraction,
                dutyCycle: (battery.dutyCycle * 100).toFixed(1) + '%',
                children: []
            };
        }

        // 复杂分支，需要子分流器
        let current = {
            type: 'battery',
            label: battery.name,
            ratio: ratio.fraction,
            dutyCycle: (battery.dutyCycle * 100).toFixed(1) + '%',
            children: []
        };

        // 根据深度添加分流器
        for (let i = 1; i < Math.min(depth, 3); i++) {
            const splitter = {
                type: 'splitter',
                label: '分流器',
                outlets: 2,
                outletsLabel: '2条分流带',
                children: [current, { type: 'return', label: '回流', children: [] }]
            };
            current = splitter;
        }

        return current;
    }

    /**
     * 计算节点位置
     */
    calculatePositions(tree, width, height) {
        const levels = [];

        // BFS收集每层节点
        const queue = [{ node: tree, level: 0 }];
        while (queue.length > 0) {
            const { node, level } = queue.shift();

            if (!levels[level]) levels[level] = [];
            levels[level].push(node);

            node.children.forEach(child => {
                queue.push({ node: child, level: level + 1 });
            });
        }

        // 计算位置
        const marginY = 50;
        const availableHeight = height - marginY * 2;
        const levelGap = Math.min(this.levelHeight, availableHeight / levels.length);

        levels.forEach((nodes, levelIdx) => {
            const y = marginY + levelIdx * levelGap;
            const marginX = 40;
            const availableWidth = width - marginX * 2;
            const gap = availableWidth / (nodes.length + 1);

            nodes.forEach((node, nodeIdx) => {
                node.x = marginX + gap * (nodeIdx + 1);
                node.y = y;
            });
        });
    }

    /**
     * 绘制连接线
     */
    drawConnections(tree) {
        const drawLines = (node) => {
            node.children.forEach(child => {
                this.ctx.beginPath();
                this.ctx.moveTo(node.x, node.y + this.nodeRadius);

                // 使用贝塞尔曲线
                const midY = (node.y + child.y) / 2;
                this.ctx.bezierCurveTo(
                    node.x, midY,
                    child.x, midY,
                    child.x, child.y - this.nodeRadius
                );

                this.ctx.strokeStyle = this.colors.line;
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                // 绘制箭头
                this.drawArrow(child.x, child.y - this.nodeRadius - 5, child.x, child.y - this.nodeRadius);

                drawLines(child);
            });
        };

        drawLines(tree);
    }

    /**
     * 绘制箭头
     */
    drawArrow(fromX, fromY, toX, toY) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const arrowLength = 8;

        this.ctx.beginPath();
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(
            toX - arrowLength * Math.cos(angle - Math.PI / 6),
            toY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(
            toX - arrowLength * Math.cos(angle + Math.PI / 6),
            toY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.strokeStyle = this.colors.line;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    /**
     * 绘制节点
     */
    drawNodes(tree) {
        const drawNode = (node) => {
            let color, icon;

            switch (node.type) {
                case 'main':
                    color = this.colors.mainBelt;
                    icon = '📦';
                    break;
                case 'splitter':
                    color = this.colors.splitter;
                    icon = '🔀';
                    break;
                case 'battery':
                    color = this.colors.battery;
                    icon = '🔋';
                    break;
                case 'return':
                    color = this.colors.return;
                    icon = '↩️';
                    break;
                default:
                    color = '#666';
                    icon = '●';
            }

            // 绘制发光效果
            const gradient = this.ctx.createRadialGradient(
                node.x, node.y, 0,
                node.x, node.y, this.nodeRadius * 1.5
            );
            gradient.addColorStop(0, color + '40');
            gradient.addColorStop(1, 'transparent');

            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, this.nodeRadius * 1.5, 0, Math.PI * 2);
            this.ctx.fillStyle = gradient;
            this.ctx.fill();

            // 绘制节点背景
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, this.nodeRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // 绘制图标
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(icon, node.x, node.y);

            // 绘制标签
            this.ctx.font = '12px "Segoe UI", sans-serif';
            this.ctx.fillStyle = this.colors.text;
            this.ctx.fillText(node.label, node.x, node.y + this.nodeRadius + 15);

            // 绘制分流器的出口数量标注
            if (node.type === 'splitter' && node.outletsLabel) {
                this.ctx.font = 'bold 11px "Segoe UI", sans-serif';
                this.ctx.fillStyle = '#fbbf24'; // 金色高亮
                this.ctx.fillText(node.outletsLabel, node.x, node.y + this.nodeRadius + 28);
            }

            // 绘制额外信息（比例、占空比）
            if (node.ratio) {
                this.ctx.font = '10px "Segoe UI", sans-serif';
                this.ctx.fillStyle = this.colors.textSecondary;
                this.ctx.fillText(node.ratio, node.x, node.y + this.nodeRadius + 28);
            }
            if (node.dutyCycle) {
                this.ctx.font = '10px "Segoe UI", sans-serif';
                this.ctx.fillStyle = this.colors.battery;
                this.ctx.fillText(node.dutyCycle, node.x, node.y + this.nodeRadius + 40);
            }

            // 递归绘制子节点
            node.children.forEach(child => drawNode(child));
        };

        drawNode(tree);
    }

    /**
     * 绘制消息
     */
    drawMessage(message) {
        const width = this.canvas.getBoundingClientRect().width;
        const height = this.canvas.getBoundingClientRect().height;

        this.ctx.font = '16px "Segoe UI", sans-serif';
        this.ctx.fillStyle = this.colors.textSecondary;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(message, width / 2, height / 2);
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SplitterVisualizer;
}
