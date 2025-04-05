import BattleDataManager from './battleDataManager.js';

class BattleUIHandler {
    constructor() {
        this.dataManager = new BattleDataManager();
        
        // Змінна для зберігання ID найгіршого бою
        this.worstBattleId = null;
        
        this.setupEventListeners();
        this.initializeUI();

        // Підписка на події від менеджера даних
        this.dataManager.eventsHistory.on('statsUpdated', () => {
            this.updateStats();
            // Оновлюємо найгірший бій при оновленні статистики
            this.findWorstBattle();
        });
        
        // Обробник події filtersApplied для отримання відфільтрованих даних
        this.dataManager.eventsHistory.on('filtersApplied', (filteredBattles) => {
            this.findWorstBattle(filteredBattles);
            this.updateBattleTable(filteredBattles);
        });
        
        // Обробник події видалення бою для оновлення інтерфейсу
        this.dataManager.eventsHistory.on('battleDeleted', (battleId) => {
            // Перевіряємо, чи видалений бій був найгіршим
            if (battleId === this.worstBattleId) {
                this.worstBattleId = null;
            }
            
            // Оновлюємо інтерфейс, щоб відобразити видалення
            this.updateBattleTable();
            this.updateStats();
            this.setupFilters();
            
            // Перераховуємо найгірший бій
            this.findWorstBattle();
        });

        this.dataManager.eventsHistory.on('dataImported', (importedData) => {
            this.updateBattleTable();
            this.updateStats();
            this.setupFilters();
            // Перераховуємо найгірший бій після імпорту
            this.findWorstBattle();
        });
    }

    async initializeUI() {
        await this.dataManager.loadFromServer();
        
        // Знаходимо найгірший бій при ініціалізації
        this.findWorstBattle();
        
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

        // Модальне вікно
        document.getElementById('close-modal')?.addEventListener('click', () => this.closeModal());
        
        // Закриття модального вікна при кліку поза ним
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('battle-modal');
            if (e.target === modal) {
                this.closeModal();
            }
        });
        
        // Закриття модального вікна по клавіші Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    // Метод для знаходження найгіршого бою
    findWorstBattle(battles = null) {
        const allBattles = battles || this.dataManager.getBattlesArray();
        
        if (!allBattles || allBattles.length === 0) {
            this.worstBattleId = null;
            console.log('Немає боїв для аналізу');
            return;
        }

        // Фільтруємо тільки завершені бої (не "в бою")
        const completedBattles = allBattles.filter(battle => battle.win !== -1);
        
        if (completedBattles.length === 0) {
            this.worstBattleId = null;
            console.log('Немає завершених боїв для аналізу');
            return;
        }

        try {
            // Знаходимо найгірший бій (з найменшою кількістю загальних очок)
            let worstBattle = completedBattles[0];
            let worstBattlePoints = this.dataManager.calculateBattleData(worstBattle).battlePoints;

            completedBattles.forEach(battle => {
                try {
                    const battleData = this.dataManager.calculateBattleData(battle);
                    // Перевіряємо, чи очки менші за поточного найгіршого бою
                    if (battleData.battlePoints < worstBattlePoints) {
                        worstBattle = battle;
                        worstBattlePoints = battleData.battlePoints;
                    }
                } catch (error) {
                    console.error('Помилка при обчисленні даних бою:', error, battle);
                }
            });

            // Зберігаємо ID найгіршого бою
            this.worstBattleId = worstBattle.id;
            console.log('Знайдено найгірший бій:', this.worstBattleId, 'з очками:', worstBattlePoints);
        } catch (error) {
            console.error('Помилка при пошуку найгіршого бою:', error);
            this.worstBattleId = null;
        }
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
        
        // Оновлюємо найгірший бій для відфільтрованих результатів
        this.findWorstBattle(filteredBattles);
    }

    clearFilters() {
        const filterIds = ['map-filter', 'vehicle-filter', 'result-filter', 'date-filter', 'player-filter'];
        filterIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });

        this.applyFilters();
    }

    // Оновлений метод для відображення таблиці боїв
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
                try {
                    const row = this.createBattleRow(battle);
                    if (row) {
                        tableBody.appendChild(row);
                    }
                } catch (error) {
                    console.error('Помилка при створенні рядка бою:', error, battle);
                }
            });
    }

    createBattleRow(battle) {
        if (!battle || !battle.id) return null;
        
        const row = document.createElement('tr');
        
        // Перевіряємо, чи це найгірший бій і чи worstBattleId не null
        if (this.worstBattleId && battle.id === this.worstBattleId) {
            row.classList.add('worst-battle');
        }

        const date = battle.startTime ? new Date(battle.startTime) : new Date();

        let resultText = 'В бою';
        let resultClass = 'inBattle';
        
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
        } else if (battleResult === 2) {
            resultClass = 'draw';
            resultText = 'Нічия';
        }
        
        try {
            // Розрахунок загальних очок за бій
            const battleData = this.dataManager.calculateBattleData(battle);
            const totalBattlePoints = battleData.battlePoints;

            row.innerHTML = `
                <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
                <td>${battle.mapName || 'Невідома мапа'}</td>
                <td class="${resultClass}">${resultText}</td>
                <td>${this.getPlayerNames(battle)}</td>
                <td>${this.getVehicles(battle)}</td>
                <td>${this.getDamage(battle)}</td>
                <td>${this.getKills(battle)}</td>
                <td>${this.getPoints(battle)}</td>
                <td class="total-points">${totalBattlePoints.toLocaleString()}</td>
                <td>
                    <button class="view-battle" data-battle-id="${battle.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="delete-battle" data-battle-id="${battle.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;

            // Виправлено передачу ID бою в обробники подій
            row.querySelector('.view-battle')?.addEventListener('click', () => this.showBattleDetails(battle));
            row.querySelector('.delete-battle')?.addEventListener('click', () => this.deleteBattle(battle.id));

            return row;
        } catch (error) {
            console.error('Помилка при обчисленні даних для рядка:', error, battle);
            return null;
        }
    }

    showBattleDetails(battle) {
        if (!battle) return;
        
        const modal = document.getElementById('battle-modal');
        if (!modal) return;
        
        // Деталі бою - заголовок
        const detailMap = document.getElementById('detail-map');
        const detailTime = document.getElementById('detail-time');
        const resultElement = document.getElementById('detail-result');
        const detailDuration = document.getElementById('detail-duration');

        if (detailMap) detailMap.textContent = battle.mapName || 'Невідома мапа';
        if (detailTime) detailTime.textContent = battle.startTime ? 
            new Date(battle.startTime).toLocaleString() : '-';

        if (resultElement) {
            let resultText = '';
            let resultClass = '';
            
            if (battle.win === 1) {
                resultText = 'Перемога';
                resultClass = 'victory';
            } else if (battle.win === 0) {
                resultText = 'Поразка';
                resultClass = 'defeat';
            } else if (battle.win === 2) {
                resultText = 'Нічия';
                resultClass = 'draw';
            } else {
                resultText = 'В бою';
                resultClass = 'inBattle';
            }
            
            resultElement.textContent = resultText;
            resultElement.className = resultClass;
        }

        if (detailDuration) {
            detailDuration.textContent = `Тривалість: ${this.formatDuration(battle.duration)}`;
        }

        // Оновлення блоку зі статистикою
        this.updateBattleStatistics(battle);
        
        // Показуємо спеціальну мітку для найгіршого бою
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            // Видаляємо попередній бейдж, якщо він є
            const oldBadge = modal.querySelector('.worst-battle-badge');
            if (oldBadge) oldBadge.remove();
            
            modalContent.classList.remove('worst-battle-modal');
            
            // Перевіряємо, чи це найгірший бій
            if (this.worstBattleId && battle.id === this.worstBattleId) {
                modalContent.classList.add('worst-battle-modal');
                
                // Додаємо мітку "Найгірший бій"
                const badge = document.createElement('div');
                badge.className = 'worst-battle-badge';
                badge.textContent = 'Найгірший бій';
                modalContent.querySelector('.modal-header').appendChild(badge);
            }
        }
        
        // Відображення модального вікна
        modal.style.display = 'block';
        
        // Додаємо клас для анімації появи
        setTimeout(() => {
            modal.querySelector('.modal-content')?.classList.add('show');
        }, 10);
    }

    updateBattleStatistics(battle) {
        if (!battle) return;
        
        try {
            const battleData = this.dataManager.calculateBattleData(battle);
            
            // Оновлюємо показники в модальному вікні
            document.getElementById('modal-damage').textContent = battleData.battleDamage.toLocaleString();
            document.getElementById('modal-frags').textContent = battleData.battleKills.toLocaleString();
            document.getElementById('modal-points').textContent = battleData.battlePoints.toLocaleString();
        } catch (error) {
            console.error('Помилка при оновленні статистики бою:', error, battle);
        }
    }

    closeModal() {
        const modal = document.getElementById('battle-modal');
        if (modal) {
            // Додаємо анімацію закриття
            modal.querySelector('.modal-content')?.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 200);
        }
    }

    async deleteBattle(battleId) {
        if (confirm('Ви впевнені, що хочете видалити цей бій?')) {
            try {
                await this.dataManager.deleteBattle(battleId);
                
                // Якщо видалено найгірший бій, скидаємо його ID
                if (battleId === this.worstBattleId) {
                    this.worstBattleId = null;
                }
                
                // Оновлюємо інтерфейс
                this.updateBattleTable();
                this.updateStats();
                
                // Знаходимо новий найгірший бій
                this.findWorstBattle();
            } catch (error) {
                console.error('Помилка при видаленні бою:', error);
                this.showNotification('Помилка при видаленні бою', 'error');
            }
        }
    }

    updateStats() {
        try {
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
        } catch (error) {
            console.error('Помилка при оновленні статистики:', error);
        }
    }

    async exportData() {
        try {
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
            
            this.showNotification('Дані успішно експортовано', 'success');
        } catch (error) {
            console.error('Помилка при експорті даних:', error);
            this.showNotification('Помилка при експорті даних', 'error');
        }
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
                    
                    if (success) {
                        // Перерахуємо найгірший бій після імпорту
                        this.findWorstBattle();
                        this.showNotification('Дані успішно імпортовано', 'success');
                    } else {
                        this.showNotification('Помилка при імпорті даних', 'error');
                    }
                } catch (error) {
                    console.error('Error importing data:', error);
                    this.showNotification('Помилка при читанні файлу', 'error');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    getPlayerNames(battle) {
        if (!battle.players) return 'Невідомий гравець';
        return Object.values(battle.players)
            .map(p => p.name || 'Невідомий гравець')
            .join('<br>');
    }

    getDamage(battle) {
        if (!battle.players) return '0';
        return Object.values(battle.players)
            .map(p => (p.damage || 0).toLocaleString())
            .join('<br>');
    }

    getKills(battle) {
        if (!battle.players) return '0';
        return Object.values(battle.players)
            .map(p => p.kills || 0)
            .join('<br>');
    }

    getPoints(battle) {
        if (!battle.players) return '0';
        return Object.values(battle.players)
            .map(p => (p.points || 0).toLocaleString())
            .join('<br>');
    }

    getVehicles(battle) {
        if (!battle.players) return 'Невідомий танк';
        return Object.values(battle.players)
            .map(p => p.vehicle || 'Невідомий танк')
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
        
        // Стилі для сповіщення
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '4px',
            color: 'white',
            zIndex: '10000',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            animation: 'fadeIn 0.3s, fadeOut 0.3s 2.7s',
            backgroundColor: type === 'success' ? '#4CAF50' : '#f44336'
        });

        // Додаємо стилі анімацій
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes fadeOut {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(20px); }
            }
        `;
        document.head.appendChild(styleSheet);

        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
            styleSheet.remove();
        }, 3000);
    }
}

export default BattleUIHandler;
