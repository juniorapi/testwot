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
    this.BattleStats = {};
    this.PlayersInfo = {};
    this.POINTS_PER_DAMAGE = 1;
    this.POINTS_PER_FRAG = 400;
    this.POINTS_PER_TEAM_WIN = 2000;
    this.curentPlayerId = null;
    this.curentArenaId = null; // при оновленні віжета записується невідомий iдентифікатор арени
    this.curentVehicle = null;
    this.isInBattle = false;

    this.setupSDKListeners();
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

  setupSDKListeners() {
    //this.sdk.commands.onClearData(this.clearSdkData.bind());
    this.sdk.data.hangar.isInHangar.watch(this.handleHangarStatus.bind(this));
    this.sdk.data.hangar.vehicle.info.watch(this.handleHangarVehicle.bind(this));
    this.sdk.data.battle.isInBattle.watch(this.handleBattleStatus.bind(this));
    this.sdk.data.battle.arena.watch(this.handleArena.bind(this));
    this.sdk.data.battle.onPlayerFeedback.watch(this.handlePlayerFeedback.bind(this));
    this.sdk.data.battle.onBattleResult.watch(this.handleBattleResult.bind(this));
    //this.sdk.data.platoon.slots.watch(this.handlePlatoon(this));
  }



  initializeBattleStats(arenaId, playerId) {
    if (!this.BattleStats[arenaId]) {
      this.BattleStats[arenaId] = {
        startTime: 0,
        duration: 0,
        win: 0,
        mapName: 'Unknown Map',
        players: {}
      };
    }

    if (!this.BattleStats[arenaId].players[playerId]) {
      this.BattleStats[arenaId].players[playerId] = {
        name: 'Unknown Player',
        damage: 0,
        kills: 0,
        points: 0,
        vehicle: 'Unknown Vehicle'
      };
    }
  }

  getPlayer(id) {
    return this.PlayersInfo[id] || null;
  }


  getPlayersIds() {
    if (typeof this.PlayersInfo === 'object' && this.PlayersInfo !== null) {
      const ids = Object.keys(this.PlayersInfo);
      return ids;
    }
  }

  calculatePlayerData(playerId) {
    let playerPoints = 0;
    let playerDamage = 0;
    let playerKills = 0;
    try {
      for (const arenaId in this.BattleStats) {
        const player = this.BattleStats[arenaId].players[playerId];
        playerPoints += player.points;
        playerDamage += player.damage;
        playerKills += player.kills;
      }
    }
    catch (error) {
      console.error('Помилка при розрахунку загальних очок гравця:');
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
        if (this.BattleStats[arenaId].win === 1) { teamPoints += this.POINTS_PER_TEAM_WIN; wins++; }
        for (const playerId in this.BattleStats[arenaId].players) {
          const player = this.BattleStats[arenaId].players[playerId];
          teamPoints += player.points;
          teamDamage += player.damage;
          teamKills += player.kills;
        }
      }
    } catch (error) {
      console.error('Помилка при розрахунку загальних очок команди:');
    }

    return { teamPoints, teamDamage, teamKills, wins, battles };
  }

  getAccessKey() {
    return localStorage.getItem('accessKey');
  }

  async clearServerData() {
    try {
      const accessKey = this.getAccessKey();
      const response = await fetch(`${this.CLEAR_STATS_URL}${accessKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Помилка при очищенні даних: ${response.statusText}`);
      }

      const data = await response.json();
    } catch (error) {
      console.error('Помилка при очищенні даних на сервері:', error);
    }
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
    try {
      await this.saveToServer();
      await this.sleep(90);
      await this.loadFromServer();
    } catch (error) {
      console.error('Error in serverData:', error);
    }
  }

  handleHangarStatus(isInHangar) {
    if (!isInHangar) return;
    this.isInBattle = !isInHangar;
    this.curentPlayerId = this.sdk.data.player.id.value;
    this.PlayersInfo[this.sdk.data.player.id.value] = this.sdk.data.player.name.value;

    this.events.emit('statsUpdated');
    this.serverData();
  }


  handleHangarVehicle(hangareVehicleData) {
    if (!hangareVehicleData) return;
    this.curentVehicle = hangareVehicleData.localizedShortName || 'Unknown Vehicle';

  }

  handlePlatoon(slots) {
    if (!slots) return;
    // TODO
  }


  handleBattleStatus(inBattle) {
    if (!inBattle) return;
    this.isInBattle = inBattle
    this.BattleStats[this.curentArenaId].startTime = Date.now();
    this.BattleStats[this.curentArenaId].win = this.BATTLE_RESULT.BATTLE;

    this.serverData();
  }

  handleArena(arenaData) {
    if (!arenaData) return;

    this.curentArenaId = this.sdk.data.battle.arenaId.value;

    this.initializeBattleStats(this.curentArenaId, this.curentPlayerId);

    this.BattleStats[this.curentArenaId].mapName = arenaData.localizedName || 'Unknown Map';
    this.BattleStats[this.curentArenaId].players[this.curentPlayerId].vehicle = this.curentVehicle;
    this.BattleStats[this.curentArenaId].players[this.curentPlayerId].name = this.sdk.data.player.name.value;
  }

  handlePlayerFeedback(feedback) {

    if (feedback.type === 'damage') {
      this.handleDamage(feedback.data);
    } else if (feedback.type === 'kill') {
      this.handleKill(feedback.data);
    }
  }

  handleDamage(damageData) {
    if (!damageData) return;
    const arenaId = this.curentArenaId;
    const playerId = this.curentPlayerId;
    this.BattleStats[arenaId].players[playerId].damage += damageData.damage;
    this.BattleStats[arenaId].players[playerId].points += damageData.damage * this.POINTS_PER_DAMAGE;

    this.serverData();
    this.events.emit('statsUpdated');
  }

  handleKill(killData) {
    if (!killData) return;
    const arenaId = this.curentArenaId;
    const playerId = this.curentPlayerId;
    this.BattleStats[arenaId].players[playerId].kills += 1;
    this.BattleStats[arenaId].players[playerId].points += this.POINTS_PER_FRAG;

    this.serverData();
    this.events.emit('statsUpdated');

  }

  handleBattleResult(result) {
    if (!result || !result.vehicles || !result.players) {
      console.error("Invalid battle result data");
      return;
    }

    const arenaId = result.arenaUniqueID
    const currentPlayerId = this.curentPlayerId;

    this.BattleStats[arenaId].duration = result.common.duration; // тривалість бою в секундах


    if (result?.players?.[currentPlayerId]?.team !== undefined &&
      result?.common?.winnerTeam !== undefined) {
      const playerTeam = Number(result.players[currentPlayerId].team);
      const winnerTeam = Number(result.common.winnerTeam);

      if (playerTeam === winnerTeam) {
        this.BattleStats[arenaId].win = this.BATTLE_RESULT.WIN;
      } else if (winnerTeam === 0) {
        this.BattleStats[arenaId].win = this.BATTLE_RESULT.DRAW;
      } else {
        this.BattleStats[arenaId].win = this.BATTLE_RESULT.LOSE;
      }
    }

    // продуктивність ???
    Array.from(this.getPlayersIds).forEach(playerId => {
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];

        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            this.BattleStats[arenaId].players[playerId].damage = vehicle.damageDealt;
            this.BattleStats[arenaId].players[playerId].kills = vehicle.kills;
            this.BattleStats[arenaId].players[playerId].points = vehicle.damageDealt + (vehicle.kills * this.POINTS_PER_FRAG);
            break;
          }
        }
      }
    });
    this.serverData();
    this.events.emit('statsUpdated');
  }

}

export default CoreService;
