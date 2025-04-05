import BattleDataManager from './battleDataManager.js';

class BattleUIHandler {
    constructor() {
        this.dataManager = new BattleDataManager();
        this.setupEventListeners();
        this.initializeUI();

        // Підписка на події від менеджера даних
        this.dataManager.eventsHistory.on('statsUpdated', () => this.updateStats());
        
        // ВИПРАВЛЕННЯ: Змінено обробник події filtersApplied для отримання відфільтрованих даних
        this.dataManager.eventsHistory.on('filtersApplied', (filteredBattles) => {
            this.updateBattleTable(filteredBattles);
        });
        
        // ВИПРАВЛЕННЯ: Додали обробник події видалення бою, щоб оновлювати інтерфейс
        this.dataManager.eventsHistory.on('battleDeleted', (battleId) => {

                // Оновлюємо інтерфейс, щоб відобразити видалення
                this.updateBattleTable();
                this.updateStats();
                this.setupFilters();

        });

        this.dataManager.eventsHistory.on('dataImported', (importedData) => {

            this.updateBattleTable();
            this.updateStats();
            this.setupFilters();
        });

    }

    async initializeUI() {
        await this.dataManager.loadFromServer();
        this.updateBattleTable();
        this.updateStats();
        this.setupFilters();
    }

    setupEventListeners() {
        // Фільтри
        document.getElementById('apply-filters')?.addEventListener('click', () => this.applyFilters());
        document.getElementById('clear-filters')?.addEventListener('click', () => this.clearFilters());

        // Імпорт/Експорт
        document.getElementById('export-data')?.addEventListener('click', () => this.exportData());
        document.getElementById('import-data')?.addEventListener('click', () => this.importData());

        // Деталі бою
        document.getElementById('close-details')?.addEventListener('click', () => this.closeBattleDetails());
    }

    setupFilters() {
        const battles = this.dataManager.getBattlesArray();

        const maps = new Set();
        const vehicles = new Set();
        const players = new Set();

        battles.forEach(battle => {
            if (battle.mapName) maps.add(battle.mapName);

            if (battle.players) {
                Object.values(battle.players).forEach(player => {
                    if (player.vehicle) vehicles.add(player.vehicle);
                    if (player.name) players.add(player.name);
                });
            }
        });

        this.populateFilter('map-filter', maps);
        this.populateFilter('vehicle-filter', vehicles);
        this.populateFilter('player-filter', players);
    }

    populateFilter(filterId, values) {
        const filter = document.getElementById(filterId);
        if (!filter) return;

        const currentValue = filter.value;

        while (filter.options.length > 1) {
            filter.remove(1);
        }

        Array.from(values).sort().forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            filter.appendChild(option);
        });

        if (currentValue) filter.value = currentValue;
    }

    // ВИПРАВЛЕННЯ: Переписано метод applyFilters для коректної роботи фільтрів
    async applyFilters() {
        const filters = {
            map: document.getElementById('map-filter')?.value || '',
            vehicle: document.getElementById('vehicle-filter')?.value || '',
            result: document.getElementById('result-filter')?.value || '',
            date: document.getElementById('date-filter')?.value || '',
            player: document.getElementById('player-filter')?.value || ''
        };

        // Логуємо фільтри для діагностики
        console.log('Застосовані фільтри:', filters);
        
        // Застосовуємо фільтри та отримуємо результат
        const filteredBattles = await this.dataManager.applyFilters(filters);
        console.log('Відфільтровані бої:', filteredBattles);
    }

    clearFilters() {
        const filterIds = ['map-filter', 'vehicle-filter', 'result-filter', 'date-filter', 'player-filter'];
        filterIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });

        this.applyFilters();
    }

    // ВИПРАВЛЕННЯ: Оновлено метод updateBattleTable, щоб він приймав масив відфільтрованих боїв
    updateBattleTable(filteredBattles = null) {
        const tableBody = document.getElementById('battle-table-body');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        
        // Використовуємо відфільтровані бої, якщо вони передані, інакше показуємо всі бої
        const battles = filteredBattles || this.dataManager.getBattlesArray();

        if (!battles || battles.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" class="no-data">Немає даних для відображення</td></tr>';
            return;
        }

        battles
            .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0))
            .forEach(battle => {
                const row = this.createBattleRow(battle);
                tableBody.appendChild(row);
            });
    }

    createBattleRow(battle) {
        if (!battle) return;
        const row = document.createElement('tr');

        const date = battle.startTime ? new Date(battle.startTime) : new Date();

        let resultText = 'inBattle';
        let resultClass = 'unknown';
        
        const battleResult = Number(battle.win);

        if (battleResult === -1) {
            resultClass = 'inBattle';
            resultText = 'В бою';
        } else if (battleResult === 0) {
            resultClass = 'defeat';
            resultText = 'Поразка';
        } else if (battleResult === 1) {
            resultClass = 'victory';
            resultText = 'Перемога';
        } else {
            resultClass = 'drawn';
            resultText = 'Нічия';
        }

        row.innerHTML = `
            <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
            <td>${battle.mapName || 'Unknown Map'}</td>
            <td class="${resultClass}">${resultText}</td>
            <td>${this.getPlayerNames(battle)}</td>
            <td>${this.getVehicles(battle)}</td>
            <td>${this.getDamage(battle)}</td>
            <td>${this.getKills(battle)}</td>
            <td>${this.getPoints(battle)}</td>
            <td>${this.formatDuration(battle.duration || 0)}</td>
            <td>
                <button class="view-battle" data-battle-id="${battle.id}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="delete-battle" data-battle-id="${battle.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        // ВИПРАВЛЕННЯ: Виправлено передачу ID бою в обробники подій
        row.querySelector('.view-battle')?.addEventListener('click', () => this.showBattleDetails(battle));
        row.querySelector('.delete-battle')?.addEventListener('click', () => this.deleteBattle(battle.id));

        return row;
    }

    showBattleDetails(battle) {
        if (!battle) return;
        const detailsElement = document.getElementById('battle-details');
        if (!detailsElement) return;

        const detailMap = document.getElementById('detail-map');
        const detailTime = document.getElementById('detail-time');
        const resultElement = document.getElementById('detail-result');
        const detailDuration = document.getElementById('detail-duration');

        if (detailMap) detailMap.textContent = battle.mapName || 'Unknown Map';
        if (detailTime) detailTime.textContent = battle.startTime ?
            new Date(battle.startTime).toLocaleString() : '-';

        if (resultElement) {
            resultElement.textContent = battle.win === 1 ? 'Перемога' : 'Поразка';
            resultElement.className = battle.win === 1 ? 'victory' : 'defeat';
        }

        if (detailDuration) {
            detailDuration.textContent = `Тривалість: ${this.formatDuration(battle.duration)}`;
        }

        this.updatePlayerPerformance(battle);
        detailsElement.style.display = 'block';
    }

    updatePlayerPerformance(battle) {
        const tbody = document.getElementById('detail-players');
        if (!tbody || !battle.players) return;

        tbody.innerHTML = '';
        const battleData  = this.dataManager.calculateBattleData(battle);
        const row = document.createElement('tr');
            row.innerHTML = `
                <td>${(battleData.battleDamage || 0).toLocaleString()}</td>
                <td>${(battleData.battleKills || 0).toLocaleString()}</td>
                <td>${(battleData.battlePoints || 0).toLocaleString()}</td>
            `;
            tbody.appendChild(row);

    }

    closeBattleDetails() {
        const detailsElement = document.getElementById('battle-details');
        if (detailsElement) detailsElement.style.display = 'none';
    }

    async deleteBattle(battleId) {
        if (confirm('Ви впевнені, що хочете видалити цей бій?')) {
            await this.dataManager.deleteBattle(battleId);
            this.updateBattleTable();
        }
    }

    updateStats() {
        const stats = this.dataManager.calculateTeamData();

        const elements = {
            'total-battles': stats.battles,
            'total-victories': stats.wins,
            'total-defeats': stats.battles - stats.wins,
            'win-rate': `${((stats.wins / stats.battles) * 100 || 0).toFixed(1)}%`,
            'total-damage': stats.teamDamage.toLocaleString(),
            'avg-damage': Math.round(stats.teamDamage / stats.battles || 0).toLocaleString(),
            'total-frags': stats.teamKills,
            'avg-frags': (stats.teamKills / stats.battles || 0).toFixed(1),
            'total-points': stats.teamPoints.toLocaleString()
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }

    async exportData() {
        const data = await this.dataManager.exportData();
        if (!data) {
            this.showNotification('Помилка при експорті даних', 'error');
            return;
        }

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'battle_history.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target?.result);
                    const success = await this.dataManager.importData(data);
                    this.showNotification(
                        success ? 'Дані успішно імпортовано' : 'Помилка при імпорті даних',
                        success ? 'success' : 'error'
                    );
                } catch (error) {
                    console.error('Error importing data:', error);
                    this.showNotification('Помилка при читанні файлу', error);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    getPlayerNames(battle) {
        if (!battle.players) return 'Unknown Player';
        return Object.values(battle.players)
            .map(p => p.name || 'Unknown Player')
            .join('<br>');
    }

    getDamage(battle) {
        if (!battle.players) return 'Unknown Player';
        return Object.values(battle.players)
            .map(p => p.damage || 0)
            .join('<br>');
    }

    getKills(battle) {
        if (!battle.players) return 'Unknown Player';
        return Object.values(battle.players)
            .map(p => p.kills || 0)
            .join('<br>');
    }

    getPoints(battle) {
        if (!battle.players) return 'Unknown Player';
        return Object.values(battle.players)
            .map(p => p.points || 0)
            .join('<br>');
    }

    getVehicles(battle) {
        if (!battle.players) return 'Unknown Player';
        return Object.values(battle.players)
            .map(p => p.vehicle || 'Unknown Vehicle')
            .join('<br>');
    }

    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

export default BattleUIHandler;