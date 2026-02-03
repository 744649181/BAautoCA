/**
 * 挂机电力平衡分流器设计算法
 * Power Balance Splitter Design Algorithm
 */

class SplitterAlgorithm {
    constructor() {
        this.validRatios = [];
    }

    /**
     * 生成所有可表示的比例 (1/2)^a × (1/3)^b
     * @param {number} maxDepth - 最大深度（a+b的最大值）
     * @returns {Array} 可表示比例数组，按从大到小排序
     */
    generateValidRatios(maxDepth = 5) {
        const ratios = new Set();
        ratios.add(1); // 包含1（表示全部流量）

        for (let a = 0; a <= maxDepth; a++) {
            for (let b = 0; b <= maxDepth - a; b++) {
                if (a === 0 && b === 0) continue; // 跳过1/1=1，已添加
                const value = Math.pow(0.5, a) * Math.pow(1 / 3, b);
                ratios.add(value);
            }
        }

        // 转换为数组并排序
        this.validRatios = Array.from(ratios)
            .map(v => ({
                value: v,
                fraction: this.toFraction(v),
                depth: this.getDepth(v)
            }))
            .sort((a, b) => b.value - a.value);

        return this.validRatios;
    }

    /**
     * 将小数转换为分数表示
     */
    toFraction(value) {
        if (value === 1) return "1";

        // 找到最接近的 (1/2)^a × (1/3)^b 形式
        for (let a = 0; a <= 10; a++) {
            for (let b = 0; b <= 10; b++) {
                const v = Math.pow(0.5, a) * Math.pow(1 / 3, b);
                if (Math.abs(v - value) < 1e-10) {
                    const denominator = Math.pow(2, a) * Math.pow(3, b);
                    return `1/${denominator}`;
                }
            }
        }
        return value.toFixed(6);
    }

    /**
     * 获取比例的深度（所需分流器层数）
     */
    getDepth(value) {
        if (value === 1) return 0;

        for (let a = 0; a <= 10; a++) {
            for (let b = 0; b <= 10; b++) {
                const v = Math.pow(0.5, a) * Math.pow(1 / 3, b);
                if (Math.abs(v - value) < 1e-10) {
                    return a + b;
                }
            }
        }
        return Infinity;
    }

    /**
     * 搜索最优比例组合
     * @param {Object} params - 输入参数
     * @returns {Object} 最优解
     */
    searchOptimalCombination(params) {
        const { D, P_base, batteries, R, maxDepth } = params;

        // 计算所需电池组功率
        const P_batt_needed = D - P_base;

        if (P_batt_needed <= 0) {
            return {
                baseSolution: true,
                solutions: [{
                    type: "base",
                    name: "无需电池",
                    desc: "基地发电已满足需求",
                    batteryCount: 0,
                    batteries: [],
                    totalPower: P_base,
                    excess: P_base - D,
                    complexity: 0
                }]
            };
        }

        // 生成可用比例
        this.generateValidRatios(maxDepth);

        // 估算电池数量范围
        const maxBatteryPower = Math.max(...batteries.map(b => b.power));
        const minBatteries = Math.ceil(P_batt_needed / maxBatteryPower);
        const minConsume = Math.min(...batteries.map(b => b.consume));
        const maxBatteriesFromFuel = Math.floor(R / minConsume);
        const searchLimit = Math.min(minBatteries + 3, maxBatteriesFromFuel + 2, 8);

        let allCandidates = [];

        // 搜索不同数量的电池组合
        for (let n = minBatteries; n <= searchLimit; n++) {
            const candidates = this.searchForNBatteries(n, params);
            allCandidates = allCandidates.concat(candidates);
        }

        if (allCandidates.length === 0) {
            return {
                success: false,
                message: "无法找到满足需求的方案",
                solutions: []
            };
        }

        // 评分与筛选逻辑
        // 1. 最精确方案 (Minimum Excess)
        allCandidates.sort((a, b) => a.excess - b.excess);
        const bestPrecision = allCandidates[0];
        bestPrecision.type = "precision";
        bestPrecision.name = "精准优先";
        bestPrecision.desc = "追求最小的功率溢出";

        // 2. 最简单方案 (Lowest Complexity, with reasonable excess)
        // Complexity = BatteryCount * 10 + TotalDepth
        // Allow excess up to 5% of D or 100W, whichever is larger, to find simpler ones
        const excessThreshold = Math.max(D * 0.05, 100);

        const simpleCandidates = allCandidates.filter(c => c.excess <= excessThreshold + 0.01);
        let bestSimple = null;
        if (simpleCandidates.length > 0) {
            simpleCandidates.sort((a, b) => a.complexity - b.complexity || a.excess - b.excess);
            bestSimple = simpleCandidates[0];
        } else {
            // If no simple solution within threshold, just take the overall simplest
            const sortedByComplexity = [...allCandidates].sort((a, b) => a.complexity - b.complexity);
            bestSimple = sortedByComplexity[0];
        }

        // If bestSimple is same as bestPrecision, try to find the next best simple one
        if (bestSimple === bestPrecision && simpleCandidates.length > 1) {
            bestSimple = simpleCandidates[1];
        }

        bestSimple.type = "simple";
        bestSimple.name = "结构精简";
        bestSimple.desc = "分流器层数更少或电池更少";


        // 3. 均衡/替代方案 (Alternative)
        // Try to find a solution with different battery count or type mix if possible
        let bestBalanced = null;
        for (const cand of allCandidates) {
            if (cand !== bestPrecision && cand !== bestSimple) {
                // Prefer slightly different excess or battery count
                if (Math.abs(cand.excess - bestPrecision.excess) > 1 || cand.batteryCount !== bestPrecision.batteryCount) {
                    bestBalanced = cand;
                    break;
                }
            }
        }

        if (bestBalanced) {
            bestBalanced.type = "balanced";
            bestBalanced.name = "均衡方案";
            bestBalanced.desc = "综合考虑功率与复杂度";
        }

        // Compile final list
        const solutions = [bestPrecision];
        if (bestSimple && bestSimple !== bestPrecision) {
            solutions.push(bestSimple);
        }
        if (bestBalanced && bestBalanced !== bestPrecision && bestBalanced !== bestSimple) {
            solutions.push(bestBalanced);
        }

        return {
            success: true,
            solutions: solutions
        };
    }

    /**
     * 为固定数量的电池组搜索所有可行方案
     */
    searchForNBatteries(n, params) {
        const { D, P_base, batteries, R } = params;
        const P_batt_needed = D - P_base;

        const maxFullLoadRatio = Math.max(...batteries.map(b => b.consume / R));
        const usableRatios = this.validRatios.filter(r => r.value <= maxFullLoadRatio + 0.0001);

        if (usableRatios.length === 0) return [];

        const candidates = [];
        // Keep track of best excess for this N to pruning? 
        // We want diversity, so strictly pruning by excess might lose simple solutions efficiently.
        // But full exhaustive search is too slow.

        // Simpler approach: gather valid assignments, simplified pruning.

        const searchCombinations = (index, currentRatios, remainingSum) => {
            if (currentRatios.length === n) {
                const totalRatio = currentRatios.reduce((sum, r) => sum + r.value, 0);
                if (totalRatio > 1 + 1e-10) return;

                const assignment = this.findBestVariableAssignment(currentRatios, batteries, P_batt_needed, R);

                if (assignment) {
                    const totalPower = P_base + assignment.totalGenerated;
                    const excess = totalPower - D;

                    // Calculate complexity: Sum of depths + Battery Count weight
                    const totalDepth = currentRatios.reduce((sum, r) => sum + r.depth, 0);
                    const complexity = (n * 10) + totalDepth;

                    candidates.push({
                        success: true,
                        batteryCount: n,
                        batteries: assignment.batteries,
                        totalPower: totalPower,
                        excess: excess,
                        totalRatio: totalRatio,
                        complexity: complexity
                    });
                }
                return;
            }

            const currentSum = currentRatios.reduce((sum, r) => sum + r.value, 0);
            if (currentSum > 1 + 1e-10) return;

            for (let i = index; i < usableRatios.length; i++) {
                const ratio = usableRatios[i];
                if (currentSum + ratio.value > 1 + 1e-10) continue;

                currentRatios.push(ratio);
                searchCombinations(i, currentRatios, remainingSum - ratio.value);
                currentRatios.pop();
            }
        };

        searchCombinations(0, [], 1);
        return candidates;
    }

    /**
     * 递归寻找最佳电池分配
     */
    findBestVariableAssignment(ratios, batteryTypes, targetPower, R) {
        let bestResult = null;
        let minExcess = Infinity;

        const assign = (index, currentAssignment, currentPower) => {
            // 剪枝：如果当前功率已经大大超过目标且无望变小（实际上功率只增不减），可以继续吗？
            // 这里的组合是替换性的，所以不能简单剪枝。
            // 但是如果当前部分功率 + 剩余最小可能功率 > 最佳Excess + Target，则可剪枝。

            if (index === ratios.length) {
                if (currentPower >= targetPower - 0.01) {
                    const excess = currentPower - targetPower;
                    if (excess < minExcess) {
                        minExcess = excess;
                        bestResult = {
                            totalGenerated: currentPower,
                            batteries: [...currentAssignment] // Copy
                        };
                    }
                }
                return;
            }

            const ratio = ratios[index];

            // 尝试分配每种电池
            for (const battType of batteryTypes) {
                const dutyCycle = Math.min(1, R * ratio.value / battType.consume);
                const power = battType.power * dutyCycle;

                // 简单估算剪枝：
                // 如果 (currentPower + power + 剩余全最大) < target，则此分支无效（太小）
                // 如果 (currentPower + power) 已经远超 target，是否此分支必废？
                // 不一定，后面可能是小功率。

                currentAssignment.push({
                    name: battType.name,
                    ratio: ratio,
                    dutyCycle: dutyCycle,
                    power: power,
                    typeData: battType
                });

                assign(index + 1, currentAssignment, currentPower + power);

                currentAssignment.pop();
            }
        };

        assign(0, [], 0);
        return bestResult;
    }

    /**
     * 构造分流器网络结构
     */
    constructSplitterNetwork(solution) {
        if (!solution.success || solution.batteryCount === 0) {
            return {
                description: "无需分流器网络",
                nodes: []
            };
        }

        const ratios = solution.batteries.map(b => b.ratio);
        const totalRatio = solution.totalRatio || ratios.reduce((sum, r) => sum + r.value, 0);

        // 构建网络描述
        const network = this.buildNetworkTree(ratios, totalRatio);

        return network;
    }

    /**
     * 递归构建网络树
     */
    buildNetworkTree(ratios, totalFlow = 1, depth = 0) {
        const indent = "  ".repeat(depth);
        let description = "";
        const nodes = [];

        if (ratios.length === 0) {
            return { description: `${indent}└─ 回流\n`, nodes: [] };
        }

        if (ratios.length === 1) {
            const ratio = ratios[0];
            // 需要从totalFlow分出ratio.value
            const targetRatio = ratio.value / totalFlow;
            const branchDesc = this.constructBranch(ratio, totalFlow, depth);
            return branchDesc;
        }

        // 多个电池组，使用分流器分割
        const n = ratios.length;

        if (n === 2) {
            // 两个电池组 + 回流 = 三出口分流器
            description += `${indent}[三出口分流器]\n`;
            description += `${indent}├─ 出口1 (1/3):\n`;
            description += this.constructBranch(ratios[0], totalFlow / 3, depth + 2).description;
            description += `${indent}├─ 出口2 (1/3):\n`;
            description += this.constructBranch(ratios[1], totalFlow / 3, depth + 2).description;
            description += `${indent}└─ 出口3 → 回流\n`;
        } else if (n === 3) {
            // 三个电池组 = 三出口分流器
            description += `${indent}[三出口分流器]\n`;
            for (let i = 0; i < 3; i++) {
                const prefix = i < 2 ? "├─" : "└─";
                description += `${indent}${prefix} 出口${i + 1} (1/3):\n`;
                description += this.constructBranch(ratios[i], totalFlow / 3, depth + 2).description;
            }
        } else {
            // 更多电池组，先分成两半或三份
            description += `${indent}[三出口分流器]\n`;
            const perGroup = Math.ceil(n / 3);
            const groups = [];
            for (let i = 0; i < n; i += perGroup) {
                groups.push(ratios.slice(i, Math.min(i + perGroup, n)));
            }

            groups.forEach((group, idx) => {
                const prefix = idx < groups.length - 1 ? "├─" : "└─";
                if (group.length === 0) {
                    description += `${indent}${prefix} 出口${idx + 1} → 回流\n`;
                } else {
                    description += `${indent}${prefix} 出口${idx + 1} (1/${groups.length}):\n`;
                    const subNetwork = this.buildNetworkTree(group, totalFlow / groups.length, depth + 2);
                    description += subNetwork.description;
                }
            });

            // 如果不足三出口，补充回流
            for (let i = groups.length; i < 3; i++) {
                description += `${indent}└─ 出口${i + 1} → 回流\n`;
            }
        }

        return { description, nodes };
    }

    /**
     * 构建单个电池组的分支
     */
    constructBranch(ratio, inputFlow, depth) {
        const indent = "  ".repeat(depth);
        let description = "";

        // 计算需要的分流深度
        const targetRatio = ratio.value;

        // 找到需要的分流序列
        const sequence = this.findSplitSequence(targetRatio, inputFlow);

        if (sequence.length === 0) {
            description += `${indent}└─ → ${ratio.fraction} → 电池组\n`;
        } else {
            let currentIndent = indent;
            sequence.forEach((split, idx) => {
                if (split.type === 'battery') {
                    description += `${currentIndent}└─ → 电池组 (比例: ${ratio.fraction})\n`;
                } else if (split.type === 'return') {
                    description += `${currentIndent}└─ → 回流\n`;
                } else {
                    const splitterType = split.outlets === 2 ? "两出口" : "三出口";
                    description += `${currentIndent}[${splitterType}分流器]\n`;

                    for (let i = 0; i < split.outlets; i++) {
                        const prefix = i < split.outlets - 1 ? "├─" : "└─";
                        if (i === split.targetOutlet) {
                            description += `${currentIndent}${prefix} 出口${i + 1}:\n`;
                            currentIndent += "  ";
                        } else {
                            description += `${currentIndent}${prefix} 出口${i + 1} → 回流\n`;
                        }
                    }
                }
            });
            description += `${currentIndent}└─ → 电池组 (比例: ${ratio.fraction})\n`;
        }

        return { description };
    }

    /**
     * 找到实现目标比例的分流序列
     */
    findSplitSequence(targetRatio, inputFlow = 1) {
        const sequence = [];
        let currentRatio = inputFlow;

        // 分解目标比例为 (1/2)^a × (1/3)^b
        let a = 0, b = 0;
        for (let i = 0; i <= 10; i++) {
            for (let j = 0; j <= 10; j++) {
                const v = Math.pow(0.5, i) * Math.pow(1 / 3, j);
                if (Math.abs(v - targetRatio) < 1e-10) {
                    a = i;
                    b = j;
                    break;
                }
            }
        }

        // 生成分流序列
        for (let i = 0; i < b; i++) {
            sequence.push({ type: 'splitter', outlets: 3, targetOutlet: 0 });
        }
        for (let i = 0; i < a; i++) {
            sequence.push({ type: 'splitter', outlets: 2, targetOutlet: 0 });
        }

        return sequence;
    }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SplitterAlgorithm;
}
