import EventEmitter from './eventEmitter.js';

class CoreService {
  constructor() {
    try {
      this.sdk = new WotstatWidgetsSdk.WidgetSDK();
    } catch (error) {
      console.error('Failed to initialize SDK:', error);
      throw error;
    }

    this.BATTLE_STATS_URL = "https://node-server-under-0eb3b9aee4e3.herokuapp.com/api/battle-stats/";
    this.CLEAR_STATS_URL = "https://node-server-under-0eb3b9aee4e3.herokuapp.com/api/clear/"

    this.POINTS_PER_DAMAGE = 1;
    this.POINTS_PER_FRAG = 400;
    this.POINTS_PER_TEAM_WIN = 2000;

    const savedState = localStorage.getItem('gameState');
    if (savedState) {
      const state = JSON.parse(savedState);
      this.BattleStats = state.BattleStats || {};
      this.PlayersInfo = state.PlayersInfo || {};
      this.curentPlayerId = state.curentPlayerId || null;
      this.curentArenaId = state.curentArenaId || null;
      this.curentVehicle = state.curentVehicle || null;
      this.isInPlatoon = state.isInPlatoon || false;
      this.platoonIds = state.platoonIds || null;
    } else {

      this.BattleStats = {};
      this.PlayersInfo = {};
      this.curentPlayerId = null;
      this.curentArenaId = null;
      this.curentVehicle = null;
      this.platoonIds = null;
    }

    this.setupSDKListeners();
    this.eventsCore = new EventEmitter();
    this.loadFromServer();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setupSDKListeners() {
    this.sdk.data.hangar.isInHangar.watch(this.handleHangarStatus.bind(this));
    this.sdk.data.hangar.vehicle.info.watch(this.handleHangarVehicle.bind(this));
    this.sdk.data.platoon.isInPlatoon.watch(this.handlePlatoonStatus.bind(this));
    this.sdk.data.platoon.slots.watch(this.handlePlatoonSlots.bind(this));
    this.sdk.data.battle.isInBattle.watch(this.handleBattleStatus.bind(this));
    this.sdk.data.battle.arena.watch(this.handleArena.bind(this));
    this.sdk.data.battle.onPlayerFeedback.watch(this.handlePlayerFeedback.bind(this));
    this.sdk.data.battle.onBattleResult.watch(this.handleBattleResult.bind(this));
  }

  saveState() {
    const state = {
      BattleStats: this.BattleStats,
      PlayersInfo: this.PlayersInfo,
      curentPlayerId: this.curentPlayerId,
      curentArenaId: this.curentArenaId,
      curentVehicle: this.curentVehicle,
      isInPlatoon: this.isInPlatoon,
      platoonIds: this.platoonIds
    };
    localStorage.setItem('gameState', JSON.stringify(state));
  }

  clearState() {
    localStorage.removeItem('gameState');

    this.BattleStats = {};
    this.PlayersInfo = {};
    this.curentPlayerId = null;
    this.curentArenaId = null;
    this.curentVehicle = null;
    this.isInPlatoon = false;
    this.platoonIds = null;
  }

  initializeBattleStats(arenaId, playerId) {
    if (!this.BattleStats[arenaId]) {
      this.BattleStats[arenaId] = {
        startTime: Date.now(),
        duration: 0,
        win: -1,
        mapName: 'Unknown Map',
        players: {}
      };
    }

    if (!this.BattleStats[arenaId].players[playerId]) {
      this.BattleStats[arenaId].players[playerId] = {
        name: this.PlayersInfo[playerId] || 'Unknown Player',
        damage: 0,
        kills: 0,
        points: 0,
        vehicle: this.curentVehicle || 'Unknown Vehicle'
      };
    }
  }

  getPlayer(id) {
    return this.PlayersInfo[id] || null;
  }

  getPlayersIds() {
    return Object.keys(this.PlayersInfo);
  }
  
  getCurentPlayerIndex() {
    return this.getPlayersIds().indexOf(this.curentPlayerId);
  }
  
  compareArrays(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
      return false;
    }

    const shorterArr = arr1.length <= arr2.length ? arr1 : arr2;
    const longerArr = arr1.length <= arr2.length ? arr2 : arr1;

    let matches = 0;

    shorterArr.forEach(element => {
      if (longerArr.includes(element)) {
        matches++;
      }
    });

    return matches === shorterArr.length;
  }

  calculatePlayerData(playerId) {
    let playerPoints = 0;
    let playerDamage = 0;
    let playerKills = 0;

    try {
      for (const arenaId in this.BattleStats) {
        const player = this.BattleStats[arenaId].players[playerId];
        if (player) {
          playerPoints += player.points || 0;
          playerDamage += player.damage || 0;
          playerKills += player.kills || 0;
        }
      }
    } catch (error) {
      console.error('Помилка при розрахунку загальних очок гравця:', error);
    }

    return { playerPoints, playerDamage, playerKills };
  }

  calculateTeamData() {
    let teamPoints = 0;
    let teamDamage = 0;
    let teamKills = 0;
    let wins = 0;
    let battles = 0;

    try {
      for (const arenaId in this.BattleStats) {
        battles++;
        if (this.BattleStats[arenaId].win === 1) {
          teamPoints += this.POINTS_PER_TEAM_WIN;
          wins++;
        }

        for (const playerId in this.BattleStats[arenaId].players) {
          const player = this.BattleStats[arenaId].players[playerId];
          teamPoints += player.points || 0;
          teamDamage += player.damage || 0;
          teamKills += player.kills || 0;
        }
      }
    } catch (error) {
      console.error('Помилка при розрахунку загальних очок команди:', error);
    }

    return { teamPoints, teamDamage, teamKills, wins, battles };
  }

  getAccessKey() {
    return localStorage.getItem('accessKey');
  }

  async saveToServer() {
    try {
      const response = await fetch(`${this.BATTLE_STATS_URL}${this.getAccessKey()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Player-ID': this.curentPlayerId
        },
        body: JSON.stringify({
          BattleStats: this.BattleStats,
          PlayerInfo: this.PlayersInfo,
        }),
      });
  
      if (!response.ok && response.status !== 202) {
        throw new Error(`Помилка при збереженні даних: ${response.statusText}`);
      }
  
      await this.sleep(300); 
      await this.loadFromServer();
  
      this.eventsCore.emit('statsUpdated');
      this.saveState();
  
      return true;
    } catch (error) {
      console.error('Error in serverData:', error);
      return false;
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

      if (data.success) {
        if (data.BattleStats) {
          this.BattleStats = data.BattleStats;
        }
        if (data.PlayerInfo) {
          this.PlayersInfo = data.PlayerInfo;
        }
        this.eventsCore.emit('statsUpdated');
      }
      return true;
    } catch (error) {
      console.error('Помилка при завантаженні даних із сервера:', error);
      throw error;
    }
  }

  async clearServerData() {
    try {
      const accessKey = this.getAccessKey();
      const response = await fetch(`${this.CLEAR_STATS_URL}${accessKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
      });

      if (!response.ok) {
        throw new Error(`Помилка при очищенні даних: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        this.BattleStats = {};
        this.PlayersInfo = {};
        this.eventsCore.emit('statsUpdated');
      }

    } catch (error) {
      console.error('Помилка при очищенні даних на сервері:', error);
      throw error;
    }
  }

  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  async serverData() {
    try {
      await this.saveToServer();
      await this.sleep(30);
      await this.loadFromServer();
      this.eventsCore.emit('statsUpdated');
      await this.sleep(30);
      this.saveState();
    } catch (error) {
      console.error('Error in serverData:', error);
    }
  }


  handleHangarStatus(isInHangar) {
    if (!isInHangar) return;

    const playersID = this.getPlayersIds();
    this.curentPlayerId = this.sdk.data.player.id.value;

    if (playersID.length >= 1 && !this.isInPlatoon) return;

    this.PlayersInfo[this.curentPlayerId] = this.sdk.data.player.name.value;


    this.serverData()
  }



  handleHangarVehicle(hangareVehicleData) {
    if (!hangareVehicleData) return;
    this.curentVehicle = hangareVehicleData.localizedShortName || 'Unknown Vehicle';
  }

  handlePlatoonStatus(isInPlatoon) {
    if (!isInPlatoon) return;
    this.isInPlatoon = isInPlatoon;

    //const playersID = this.getPlayersIds();
    //const platoonIds = this.platoonIds;
    //const isPlatoonChanges = this.compareArrays(playersID, platoonIds);

    //if (isPlatoonChanges && this.curentPlayerId != null) {
    //this.PlayersInfo[this.curentPlayerId] = this.sdk.data.player.name.value;

    //this.serverData(this.curentPlayerId);
    //}
  }

  handlePlatoonSlots(slots) {
    if (!slots) return;

    this.platoonIds = slots.dbid;

  }

  handleBattleStatus(inBattle) {
    if (!inBattle) return;

      const playerIds = this.getPlayersIds();
      const index = this.getCurentPlayerIndex();
    if (this.curentPlayerId === null ) {
       this.curentPlayerId = playerIds[index];
    }
  }

  handleArena(arenaData) {
    if (!arenaData) return;

    this.curentArenaId = this.sdk?.data?.battle?.arenaId?.value ?? null;
    if (this.curentArenaId == null) return;

    this.initializeBattleStats(this.curentArenaId, this.curentPlayerId);


    this.BattleStats[this.curentArenaId].mapName = arenaData.localizedName || 'Unknown Map';
    this.BattleStats[this.curentArenaId].players[this.curentPlayerId].vehicle = this.curentVehicle;
    this.BattleStats[this.curentArenaId].players[this.curentPlayerId].name = this.sdk.data.player.name.value;

    this.serverData();
  }

  handlePlayerFeedback(feedback) {
    if (!feedback || !feedback.type) return;

    if (feedback.type === 'damage') {
      this.handleDamage(feedback.data);
    } else if (feedback.type === 'kill') {
      this.handleKill(feedback.data);
    }
  }

  handleDamage(damageData) {
    if (!damageData || !this.curentArenaId || !this.curentPlayerId) return;

    const arenaId = this.curentArenaId;
    const playerId = this.curentPlayerId;

    this.BattleStats[arenaId].players[playerId].damage += damageData.damage;
    this.BattleStats[arenaId].players[playerId].points += damageData.damage * this.POINTS_PER_DAMAGE;

    this.serverData();
  }

  handleKill(killData) {
    if (!killData || !this.curentArenaId || !this.curentPlayerId) return;

    const arenaId = this.curentArenaId;
    const playerId = this.curentPlayerId;

    this.BattleStats[arenaId].players[playerId].kills += 1;
    this.BattleStats[arenaId].players[playerId].points += this.POINTS_PER_FRAG;

    this.serverData();
  }

  handleBattleResult(result) {
    if (!result || !result.vehicles || !result.players || !this.curentPlayerId) {
      console.error("Invalid battle result data");
      return;
    }

    const arenaId = result.arenaUniqueID;
    if (!arenaId) return;

    this.BattleStats[arenaId].duration = result.common.duration;

    if (result?.players?.[this.curentPlayerId]?.team !== undefined &&
      result?.common?.winnerTeam !== undefined) {
      const playerTeam = Number(result.players[this.curentPlayerId].team);
      const winnerTeam = Number(result.common.winnerTeam);

      if (playerTeam === winnerTeam) {
        this.BattleStats[arenaId].win = 1;
      } else if (winnerTeam === 0) {
        this.BattleStats[arenaId].win = 2;
      } else {
        this.BattleStats[arenaId].win = 0;
      }
    }

    const playerIds = this.getPlayersIds();
    const index = this.getCurentPlayerIndex();
    for (const playerId of playerIds) {
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            const playerStats = this.BattleStats[arenaId].players[playerId];
            playerStats.damage = vehicle.damageDealt;
            playerStats.kills = vehicle.kills;
            playerStats.points = vehicle.damageDealt + (vehicle.kills * this.POINTS_PER_FRAG);
            // this.saveToServer(playerId); // помилка, сервер лягає
            // this.sleep(10);
            break;
          }
        }
      }
    }
    this.sleep(index * 10 + 20);
    this.serverData();
  }
}

export default CoreService;
