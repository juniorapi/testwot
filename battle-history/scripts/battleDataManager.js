import EventEmitter from './eventEmitter.js';

class BattleDataManager {
  constructor() {
    this.POINTS_PER_DAMAGE = 1;
    this.POINTS_PER_FRAG = 400;
    this.POINTS_PER_TEAM_WIN = 2000;
    this.BATTLE_STATS_URL = "https://node-server-under-0eb3b9aee4e3.herokuapp.com/api/battle-stats/";
    this.BattleStats = {};
    this.PlayersInfo = {};

    this.filteredBattles = [];
    this.events = new EventEmitter();
  }

  BATTLE_RESULT = {
    BATTLE: -1,
    WIN: 1,
    DRAW: 2,
    LOSE: 0
  };
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAccessKey() {
    return localStorage.getItem('accessKey');
  }

  getBattlesArray() {
    return Object.entries(this.BattleStats).map(([arenaId, battle]) => ({
      id: arenaId,
      ...battle
    }));
  }

  calculateBattleData(battle) {
    let battlePoints = 0;
    let battleDamage = 0;
    let battleKills = 0;

    if (battle && battle.players) {
      Object.values(battle.players).forEach(player => {
        battlePoints += player.points || 0;
        battleDamage += player.damage || 0;
        battleKills += player.kills || 0;
      });
    }

    return { battlePoints, battleDamage, battleKills };
  }

  calculatePlayerData(playerId) {
    let playerPoints = 0;
    let playerDamage = 0;
    let playerKills = 0;

    for (const arenaId in this.BattleStats) {
      const player = this.BattleStats[arenaId].players[playerId];
      playerPoints += player.points;
      playerDamage += player.damage;
      playerKills += player.kills;
    }
    return { playerPoints, playerDamage, playerKills };
  }

  calculateTeamData() {
    let teamPoints = 0;
    let teamDamage = 0;
    let teamKills = 0;
    let wins = 0;
    let battles = 0;


    for (const arenaId in this.BattleStats) {
      battles++;
      if (this.BattleStats[arenaId].win === 1) { teamPoints += this.POINTS_PER_TEAM_WIN; wins++; }
      for (const playerId in this.BattleStats[arenaId].players) {
        const player = this.BattleStats[arenaId].players[playerId];
        teamPoints += player.points;
        teamDamage += player.damage;
        teamKills += player.kills;
      }
    }
    return { teamPoints, teamDamage, teamKills, wins, battles };
  }

  async saveToServer() {
    try {
      const accessKey = this.getAccessKey();
      const response = await fetch(`${this.BATTLE_STATS_URL}${accessKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BattleStats: this.BattleStats,
          PlayerInfo: this.PlayersInfo,
        }),
      });

      if (!response.ok) {
        throw new Error(`Помилка при збереженні даних: ${response.statusText}`);
      }

    } catch (e) {
      console.error('Помилка при збереженні даних на сервер:', e);
    }
  }

  async loadFromServer() {
    try {
      const accessKey = this.getAccessKey();
      const response = await fetch(`${this.BATTLE_STATS_URL}${accessKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Помилка при завантаженні даних: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.BattleStats) Object.assign(this.BattleStats, data.BattleStats);
      if (data.PlayerInfo) Object.assign(this.PlayersInfo, data.PlayerInfo);


    } catch (e) {
      console.error('Помилка при завантаженні даних із сервера:', e);
    }
  }

  async serverData() {
    await this.saveToServer();
    this.sleep(90)
    await this.loadFromServer();
  }

  // Видалення бою
  async deleteBattle(battleId) {

    try {
      const accessKey = this.getAccessKey();
      const response = await fetch(`${this.BATTLE_STATS_URL}${accessKey}\\${battleId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }   
      });
     
      if (!response.ok) {
        throw new Error(`Помилка при очищенні даних: ${response.statusText}`);
      }

      const data = await response.json();
      return true;
    } catch (error) {
      console.error('Помилка при очищенні даних на сервері:', error);
    }
    return false;
  }

  async applyFilters(filters) {
    this.filteredBattles = [...this.allBattles];

    if (filters.map) {
      this.filteredBattles = this.filteredBattles.filter(battle =>
        battle.map === filters.map);
    }
    if (filters.vehicle) {
      this.filteredBattles = this.filteredBattles.filter(battle =>
        battle.players && Object.values(battle.players)
          .some(player => player.vehicle === filters.vehicle));
    }
    if (filters.result) {
      this.filteredBattles = this.filteredBattles.filter(battle => {
        switch (filters.result) {
          case 'draw': return battle.draw === true;
          case 'victory': return battle.victory === true && !battle.draw;
          default: return !battle.victory && !battle.draw;
        }
      });
    }
    if (filters.date) {
      const filterDate = new Date(filters.date);
      filterDate.setHours(0, 0, 0, 0);
      this.filteredBattles = this.filteredBattles.filter(battle => {
        if (!battle.timestamp) return false;
        const battleDate = new Date(battle.timestamp);
        battleDate.setHours(0, 0, 0, 0);
        return battleDate.getTime() === filterDate.getTime();
      });
    }
    if (filters.player) {
      this.filteredBattles = this.filteredBattles.filter(battle =>
        battle.players && Object.values(battle.players)
          .some(player => player.name === filters.player));
    }

    this.events.emit('filtersApplied', this.filteredBattles);
    return this.filteredBattles;
  }

  async exportData() {
    try {
      return JSON.stringify(this.BattleStats, null, 2);
    } catch (e) {
      console.error("Помилка при експортуванні даних:", e);
      return null;
    }
  }

  
  async importData(importedData) {
    try {
      if (!importedData || typeof importedData !== 'object') {
        console.error("Неправильний формат даних для імпорту");
        return false;
      }

      await this.loadFromServer();

      for (const [arenaId, battleData] of Object.entries(importedData)) {
        if (!battleData || typeof battleData !== 'object') continue;

        if (!this.validateBattleData(battleData)) continue;

        if (this.BattleStats[arenaId]) {
          this.BattleStats[arenaId] = {
            ...this.BattleStats[arenaId],
            ...battleData,
            players: {
              ...this.BattleStats[arenaId].players,
              ...battleData.players
            }
          };
        } else {
          this.BattleStats[arenaId] = battleData;
        }
      }

      const saveSuccess = await this.saveToServer();
      if (!saveSuccess) {
        throw new Error('Failed to save data to server');
      }

      this.events.emit('dataImported');
      return true;

    } catch (e) {
      console.error("Помилка при імпорті даних:", e);
      return false;
    }
  }

  validateBattleData(battleData) {
    const requiredFields = ['startTime', 'duration', 'win', 'mapName', 'players'];

    for (const field of requiredFields) {
      if (!(field in battleData)) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }

    if (typeof battleData.players !== 'object') {
      console.error('Invalid players data structure');
      return false;
    }

    for (const [playerId, playerData] of Object.entries(battleData.players)) {
      if (!this.validatePlayerData(playerData)) {
        console.error(`Invalid player data for ID: ${playerId}`);
        return false;
      }
    }

    return true;
  }

  validatePlayerData(playerData) {
    const requiredPlayerFields = ['name', 'damage', 'kills', 'points', 'vehicle'];

    for (const field of requiredPlayerFields) {
      if (!(field in playerData)) {
        console.error(`Missing required player field: ${field}`);
        return false;
      }
    }

    if (typeof playerData.name !== 'string' ||
      typeof playerData.damage !== 'number' ||
      typeof playerData.kills !== 'number' ||
      typeof playerData.points !== 'number' ||
      typeof playerData.vehicle !== 'string') {
      console.error('Invalid player data types');
      return false;
    }

    this.events.emit('statsUpdated');
    return true;
  }

//   async synchronizeStats() {
//     try {

//       this.serverData();
//       // TODO: Implement synchronization logic

//       return true;
//     } catch (e) {
//       console.error("Error synchronizing stats:", e);
//       return false;
//     }
//   }
}

export default BattleDataManager;
