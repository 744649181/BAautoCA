/**
 * 主程序入口
 * Main Application Entry
 */

document.addEventListener('DOMContentLoaded', () => {
    const algorithm = new SplitterAlgorithm();
    const visualizer = new SplitterVisualizer('networkCanvas');

    const form = document.getElementById('calculatorForm');
    const resultSection = document.getElementById('resultSection');
    const networkSection = document.getElementById('networkSection');
    const resultSummary = document.getElementById('resultSummary');
    const batteryDetails = document.getElementById('batteryDetails');
    const networkText = document.getElementById('networkText');

    // State
    const defaultBatteries = [
        { id: 1, name: "标准电池组", power: 1100, consume: 0.025, duration: 40, selected: true }
    ];
    let batteries = JSON.parse(localStorage.getItem('batteries')) || defaultBatteries;

    // Initialize
    renderBatteryList();

    // Event Listeners
    document.getElementById('btnAddBattery').addEventListener('click', addBattery);

    function addBattery() {
        const nameInput = document.getElementById('newBatteryName');
        const powerInput = document.getElementById('newBatteryPower');
        const durationInput = document.getElementById('newBatteryDuration');

        const name = nameInput.value.trim();
        const power = parseFloat(powerInput.value);
        const duration = parseFloat(durationInput.value);

        if (!name || isNaN(power) || isNaN(duration) || power <= 0 || duration <= 0) {
            alert('请输入有效的电池参数');
            return;
        }

        const consume = 1 / duration; // Convert duration to rate

        batteries.push({
            id: Date.now(),
            name,
            power,
            consume,
            duration,
            selected: true
        });

        saveBatteries();
        renderBatteryList();

        // Clear inputs
        nameInput.value = '';
        powerInput.value = '';
        durationInput.value = '';
    }

    window.removeBattery = function (id) {
        if (batteries.length <= 1) {
            alert('至少保留一种电池类型');
            return;
        }
        batteries = batteries.filter(b => b.id !== id);
        saveBatteries();
        renderBatteryList();
    };

    window.toggleBattery = function (id) {
        const battery = batteries.find(b => b.id === id);
        if (battery) {
            battery.selected = !battery.selected;
            saveBatteries();
        }
    };

    function saveBatteries() {
        localStorage.setItem('batteries', JSON.stringify(batteries));
    }

    function renderBatteryList() {
        const list = document.getElementById('batteryList');
        list.innerHTML = '';

        batteries.forEach(battery => {
            // Backwards compatibility for old data without duration
            const durationDisplay = battery.duration
                ? `${battery.duration}s`
                : `${(1 / battery.consume).toFixed(1)}s`;

            const item = document.createElement('div');
            item.className = 'battery-item';
            item.innerHTML = `
                <div class="battery-info">
                    <input type="checkbox" class="battery-checkbox" 
                        ${battery.selected ? 'checked' : ''} 
                        onchange="toggleBattery(${battery.id})">
                    <span class="battery-name">${battery.name}</span>
                    <span class="battery-stats-mini">P: ${battery.power} | T: ${durationDisplay}</span>
                </div>
                <button class="btn-delete" onclick="removeBattery(${battery.id})" title="删除">×</button>
            `;
            list.appendChild(item);
        });
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        calculate();
    });

    function calculate() {
        // 获取输入参数
        const selectedBatteries = batteries.filter(b => b.selected);

        if (selectedBatteries.length === 0) {
            alert('请至少选择一种电池类型');
            return;
        }

        const params = {
            D: parseFloat(document.getElementById('targetPower').value),
            P_base: parseFloat(document.getElementById('basePower').value),
            batteries: selectedBatteries,
            R: parseFloat(document.getElementById('supplyRate').value),
            maxDepth: parseInt(document.getElementById('maxDepth').value)
        };

        // 验证输入
        const numericParams = [params.D, params.P_base, params.R, params.maxDepth];
        if (numericParams.some(v => isNaN(v) || v < 0)) {
            alert('请输入有效的正数参数');
            return;
        }

        // 执行算法
        const result = algorithm.searchOptimalCombination(params);

        if (result.success || result.baseSolution) {
            currentSolutions = result.solutions;
            activeSolutionIndex = 0;

            renderSolutionTabs(currentSolutions);
            displaySolution(currentSolutions[0], params);
        } else {
            document.getElementById('solutionTabs').style.display = 'none';
            displayResults({ success: false, message: result.message }, params);
        }
    }

    function renderSolutionTabs(solutions) {
        const tabsContainer = document.getElementById('solutionTabs');
        if (solutions.length <= 1) {
            tabsContainer.style.display = 'none';
            return;
        }

        tabsContainer.style.display = 'flex';
        tabsContainer.innerHTML = '';

        solutions.forEach((sol, index) => {
            const tab = document.createElement('div');
            tab.className = `solution-tab ${index === activeSolutionIndex ? 'active' : ''}`;
            tab.innerHTML = `
                <span class="tab-title">${sol.name || '方案 ' + (index + 1)}</span>
                <span class="tab-desc">${sol.desc || ''}</span>
                <div class="tab-meta">
                    <span>⚡ +${sol.excess.toFixed(1)}</span>
                    <span>🔋 ${sol.batteryCount}</span>
                </div>
            `;
            tab.onclick = () => switchSolution(index);
            tabsContainer.appendChild(tab);
        });
    }

    function switchSolution(index) {
        activeSolutionIndex = index;

        // Update tabs UI
        const tabs = document.querySelectorAll('.solution-tab');
        tabs.forEach((t, i) => {
            if (i === index) t.classList.add('active');
            else t.classList.remove('active');
        });

        // Re-render results
        const params = {
            D: parseFloat(document.getElementById('targetPower').value),
            P_base: parseFloat(document.getElementById('basePower').value),
            R: parseFloat(document.getElementById('supplyRate').value)
        };
        displaySolution(currentSolutions[index], params);
    }

    function displaySolution(solution, params) {
        // 构造网络
        const network = algorithm.constructSplitterNetwork(solution);

        displayResults(solution, params);
        displayNetwork(solution, network);
    }

    function displayResults(solution, params) {
        resultSection.style.display = 'block';

        // 结果摘要
        let summaryHTML = '';

        if (solution.success !== false) {
            // Find max battery power for warning threshold (approximate)
            // Note: params.batteries might not be available here if re-rendering from saved solution
            // We can infer roughly or just use a fixed heuristic if batteries not passed
            // For simplicity, just use D * 0.05 as warning
            const excessClass = solution.excess < params.D * 0.05 ? '' : 'warning';

            summaryHTML = `
                <div class="stat">
                    <span class="stat-label">方案类型</span>
                    <span class="stat-value" style="color:var(--accent-primary)">${solution.name || '标准方案'}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">电池数量</span>
                    <span class="stat-value">${solution.batteryCount}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">实际总功率</span>
                    <span class="stat-value">${solution.totalPower.toFixed(2)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">目标功率</span>
                    <span class="stat-value">${params.D}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">超出功率</span>
                    <span class="stat-value ${excessClass}">${solution.excess.toFixed(2)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">燃料利用率</span>
                    <span class="stat-value">${((solution.totalRatio || 0) * 100).toFixed(1)}%</span>
                </div>
                <div class="stat">
                    <span class="stat-label">每分钟消耗电池</span>
                    <span class="stat-value">${((solution.totalRatio || 0) * params.R * 60).toFixed(2)} 个</span>
                </div>
            `;
        } else {
            summaryHTML = `
                <div class="stat">
                    <span class="stat-label">计算状态</span>
                    <span class="stat-value error">❌ ${solution.message}</span>
                </div>
            `;
        }

        resultSummary.innerHTML = summaryHTML;

        // 电池组详情
        let batteryHTML = '';
        if (solution.batteries && solution.batteries.length > 0) {
            solution.batteries.forEach(battery => {
                const dutyCyclePercent = (battery.dutyCycle * 100).toFixed(1);
                // Use typeData name if available, else generic name
                const batName = battery.typeData ? battery.typeData.name : battery.name;

                batteryHTML += `
                    <div class="battery-card">
                        <div class="battery-header">
                            <span class="battery-name">🔋 ${batName}</span>
                            <span class="battery-ratio">${battery.ratio.fraction}</span>
                        </div>
                        <div class="battery-stats">
                            <div>占空比: <span>${dutyCyclePercent}%</span></div>
                            <div>输出功率: <span>${battery.power.toFixed(2)}</span></div>
                        </div>
                        <div class="progress-container">
                            <div class="progress-label">
                                <span>运行时间占比</span>
                                <span>${dutyCyclePercent}%</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${dutyCyclePercent}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        batteryDetails.innerHTML = batteryHTML;
    }

    function displayNetwork(solution, network) {
        networkSection.style.display = 'block';

        // 绘制可视化图
        visualizer.draw(solution);

        // 显示文字描述
        if (network && network.description) {
            networkText.textContent = network.description;
        } else {
            networkText.textContent = solution.batteryCount === 0
                ? '基地发电已满足需求，无需分流器网络'
                : '网络结构已在上方图形中展示';
        }
    }

    // 窗口大小变化时重绘
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (networkSection.style.display !== 'none' && currentSolutions.length > 0) {
                visualizer.draw(currentSolutions[activeSolutionIndex]);
            }
        }, 250);
    });

    // 自动计算一次（使用默认值）
    calculate();
});
