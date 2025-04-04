class UIService {
  constructor(coreService) {
    this.core = coreService;
    this.setupEventListeners();

    this.core.events.on('statsUpdated', () => {
      this.updatePlayersUI();
  });
  }

  updatePlayersUI() {
    const container = document.getElementById('player-container');
    container.innerHTML = '';
    
    const uniquePlayerIds = this.core.getPlayersIds();
    
    if (uniquePlayerIds.length === 0) {
      this.showEmptyMessage(container);
      return;
    }
    
    this.renderPlayerRows(container, uniquePlayerIds);
    this.updateTeamStatsUI();
  }

  showEmptyMessage(container) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = 'Гравців не знайдено';
    container.appendChild(emptyMessage);
  }

  renderPlayerRows(container, playerIds) {
    const playerRowStyle = playerIds.length > 2 ? 'font-size: 12px;' : '';
    
    playerIds.forEach(playerId => {
      const playerName = this.core.PlayersInfo[playerId];
      if (!playerName) return;
      
      const playerRow = this.createPlayerRow(playerId, playerRowStyle);
      container.appendChild(playerRow);
    });
  }

  createPlayerRow(playerId, style) {
    const playerRow = document.createElement('div');
    playerRow.className = 'player-row';
    if (style) playerRow.style = style;
    
    const playerName = this.core.PlayersInfo[playerId];
    const arenaId = this.core.curentArenaId;
    const cleanName = this.formatPlayerName(playerName);
    const displayName = this.truncateName(cleanName);

    // Перевірка наявності даних бою та гравця
    let battleDamage = 0;
    let battleKills = 0;
    
    if (arenaId && this.core.BattleStats[arenaId] && 
        this.core.BattleStats[arenaId].players && 
        this.core.BattleStats[arenaId].players[playerId]) {
      battleDamage = this.core.BattleStats[arenaId].players[playerId].damage || 0;
      battleKills = this.core.BattleStats[arenaId].players[playerId].kills || 0;
    }
    
    const totalPlayerData = this.core.calculatePlayerData(playerId);
    const displayDamage = totalPlayerData.playerDamage;
    const displayKills = totalPlayerData.playerKills;
    const playerPoints = totalPlayerData.playerPoints;     

    playerRow.innerHTML = `
      <div class="player-name" title="${cleanName}">${displayName}</div>
      <div class="stat-column">
        <div class="damage">${displayDamage.toLocaleString()}</div>
        <div class="damage-in-battle" style="font-size: 9px; color: #ff6a00;">+${battleDamage.toLocaleString()}</div>
      </div>
      <div class="stat-column">
        <div class="frags">${displayKills}</div>
        <div class="frags-in-battle" style="font-size: 9px; color: #00a8ff;">+${battleKills}</div>
      </div>
      <div class="stat-column">
        <div class="points">${playerPoints.toLocaleString()}</div>
      </div>
    `;
    
    return playerRow;
  }

  updateTeamStatsUI() {
    const teamStats = this.core.calculateTeamData();
    document.getElementById('team-damage').textContent = teamStats.teamDamage.toLocaleString();
    document.getElementById('team-frags').textContent = teamStats.teamKills.toLocaleString();
    document.getElementById('battles-count').textContent = 
      `${teamStats.wins}/${teamStats.battles}`;
    document.getElementById('team-points').textContent = teamStats.teamPoints.toLocaleString();
  }

  showSaveNotification() {
    const notification = document.createElement('div');
    Object.assign(notification.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: 'rgba(46, 204, 113, 0.9)',
      color: 'white',
      padding: '10px 15px',
      borderRadius: '4px',
      fontWeight: '500',
      zIndex: '9999',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)'
    });
    
    notification.textContent = 'Бій збережено в історію';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  }

  setupEventListeners() {
    const restoreBtn = document.getElementById('remove-history-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        if (confirm('Видалити поточну статистику історії боїв?')) {
          this.core.loadFromServer().then(() => {
            this.core.clearServerData();
            this.core.BattleStats = {};
            this.core.PlayersInfo = {};
            this.updatePlayersUI();
            alert('Статистику виделено!');
          }).catch(error => {
            console.error('Помилка при видаленні статистики:', error);
            alert('Помилка при видаленні статистики або історія боїв порожня.');
          });
        }
      });
    }

    const viewHistoryBtn = document.getElementById('view-history-btn');
    if (viewHistoryBtn) {
      const accessKey = this.core.getAccessKey();
      viewHistoryBtn.addEventListener('click', () => {
        window.open('./battle-history/?' + accessKey, '_blank');
      });
    }
  }
  
  formatPlayerName(name) {
    if (!name) return 'Невідомий гравець';
    return String(name).replace(/\s*\[.*?\]/, '');
  }

  truncateName(name) {
    if (!name) return 'Невідомий';
    return name.length > 16 ? name.substring(0, 16) + '...' : name;
  }
}

export default UIService;