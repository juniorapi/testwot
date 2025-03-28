const { WidgetSDK } = WotstatWidgetsSdk;
const sdk = new WidgetSDK();

// На початку скрипта
if (window.location.search.includes('clearcache=true')) {
  localStorage.clear();
  window.location.href = window.location.pathname;
}

// Зберігаємо дані про гравців
const players = {};
const platoonIds = new Set();

// Дані команди
const teamStats = {
  damage: 0,
  frags: 0,
  victories: 0,
  battles: 0,
  points: 0
};

// Масив для збереження історії боїв
let battleHistory = [];

// Дані для відстеження поточного бою
const currentBattleStats = {
  isActive: false,
  playersInitialDamage: {},
  playersInitialKills: {},
  fragsThisBattle: {},  // Відстеження фрагів для кожного гравця в поточному бою
  map: "", // Зберігання назви мапи
  startTime: null, // Час початку бою
  vehicles: {} // Техніка гравців
};

// Константи
const POINTS_PER_DAMAGE = 1;
const POINTS_PER_FRAG = 400;
const POINTS_PER_TEAM_WIN = 1000; // очок на команду за перемогу

// Ініціалізація даних гравця
function initPlayer(id, name) {
  if (!players[id]) {
    players[id] = {
      id: id,
      name: name || `Player ${id}`,
      damage: 0,
      kills: 0,
      battles: 0
    };
  }
  return players[id];
}

// Розрахунок очок для гравця
function calculatePlayerPoints(player) {
  return player.damage + (player.kills * POINTS_PER_FRAG);
}

// Розрахунок загальних очок команди
function calculateTeamPoints() {
  let basePoints = 0;
  
  // Сума пошкодження та фрагів від усіх гравців
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    basePoints += calculatePlayerPoints(player);
  });
  
  // Додаємо очки за перемоги для всієї команди (1000 за кожну перемогу)
  basePoints += teamStats.victories * POINTS_PER_TEAM_WIN;
  
  return basePoints;
}

// Оновлення командної статистики
function updateTeamStats() {
  teamStats.damage = 0;
  teamStats.frags = 0;
  
  // Підсумовуємо статистику всіх гравців
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    teamStats.damage += player.damage;
    teamStats.frags += player.kills;
  });
  
  // Розрахунок загальних очок команди
  teamStats.points = calculateTeamPoints();
  
  // Оновлюємо елементи UI
  document.getElementById('team-damage').textContent = teamStats.damage.toLocaleString();
  document.getElementById('team-frags').textContent = teamStats.frags.toLocaleString();
  document.getElementById('battles-count').textContent = 
    `${teamStats.victories}/${teamStats.battles}`;
  document.getElementById('team-points').textContent = teamStats.points.toLocaleString();
}

// Оновлення UI гравців
function updatePlayersUI() {
  const container = document.getElementById('player-container');
  container.innerHTML = '';
  
  // Створення рядків для кожного гравця у взводі
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    // Розрахунок очок для гравця (БЕЗ перемог, тільки пошкодження + фраги)
    const playerPoints = calculatePlayerPoints(player);
    
    // Створюємо рядок гравця
    const playerRow = document.createElement('div');
    playerRow.className = 'player-row';
    
    playerRow.innerHTML = `
      <div class="player-name">${player.name.replace(/\s*\[.*?\]/, '')}</div>
      <div class="player-stats">
        <div class="stat-column">
          <div class="stat-head">ШКОДА</div>
          <div class="damage">${player.damage.toLocaleString()}</div>
        </div>
        <div class="stat-column">
          <div class="stat-head">ФРАГИ</div>
          <div class="frags">${player.kills}</div>
        </div>
        <div class="stat-column">
          <div class="stat-head">ОЧКИ</div>
          <div class="points">${playerPoints.toLocaleString()}</div>
        </div>
      </div>
    `;
    
    container.appendChild(playerRow);
  });
  
  // Оновлюємо командну статистику
  updateTeamStats();
}

// Запам'ятовуємо поточну статистику гравців при вході в бій
function saveInitialBattleStats() {
  currentBattleStats.playersInitialDamage = {};
  currentBattleStats.playersInitialKills = {};
  currentBattleStats.fragsThisBattle = {};
  currentBattleStats.vehicles = {};
  currentBattleStats.startTime = Date.now();
  
  Array.from(platoonIds).forEach(id => {
    const player = players[id];
    if (!player) return;
    
    currentBattleStats.playersInitialDamage[id] = player.damage;
    currentBattleStats.playersInitialKills[id] = player.kills;
    currentBattleStats.fragsThisBattle[id] = 0; // Початок нового бою, 0 фрагів
  });
  
  // Зберігаємо інформацію про мапу
  if (sdk.data.battle.mapName && sdk.data.battle.mapName.value) {
    currentBattleStats.map = sdk.data.battle.mapName.value;
  }
}

// Функція для видалення гравців, які вже не є в взводі
function cleanupPlayers() {
  // Отримуємо список ID гравців, які зараз є у взводі
  const currentPlayers = new Set(platoonIds);
  
  // Перевіряємо кожен запис у словнику players
  Object.keys(players).forEach(id => {
    // Якщо гравця немає в поточному взводі, видаляємо його
    if (!currentPlayers.has(id)) {
      delete players[id];
    }
  });
  
  // Оновлюємо UI
  updatePlayersUI();
  
  // Зберігаємо оновлену статистику
  saveStats();
}

// Отримання даних про взвод
sdk.data.platoon.isInPlatoon.watch((isInPlatoon) => {
  // Додаємо поточного гравця до списку
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId) {
    platoonIds.add(currentPlayerId);
    initPlayer(currentPlayerId, sdk.data.player.name.value);
  }
  
  // Якщо не у взводі, оновлюємо UI тільки з поточним гравцем
  if (!isInPlatoon) {
    updatePlayersUI();
  }
});

// Відстеження складу взводу
sdk.data.platoon.slots.watch((slots) => {
  if (!slots || !Array.isArray(slots)) return;
  
  // Запам'ятовуємо попередній склад взводу для порівняння
  const previousPlatoonIds = new Set(platoonIds);
  
  // Очищуємо поточний список гравців взводу
  platoonIds.clear();
  
  // Додаємо поточного гравця до списку
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId) {
    platoonIds.add(currentPlayerId);
    initPlayer(currentPlayerId, sdk.data.player.name.value);
  }
  
  // Додаємо всіх гравців взводу до списку
  slots.forEach(slot => {
    if (slot && slot.dbid) {
      platoonIds.add(slot.dbid);
      initPlayer(slot.dbid, slot.name);
    }
  });
  
  // Перевіряємо, чи змінився склад взводу
  let platoonChanged = false;
  if (previousPlatoonIds.size !== platoonIds.size) {
    platoonChanged = true;
  } else {
    // Перевіряємо, чи всі ID з попереднього списку є в новому
    for (let id of previousPlatoonIds) {
      if (!platoonIds.has(id)) {
        platoonChanged = true;
        break;
      }
    }
  }
  
  // Якщо склад взводу змінився, видаляємо гравців, яких більше немає
  if (platoonChanged) {
    cleanupPlayers();
  }
  
  updatePlayersUI();
});

// Слідкуємо за ім'ям гравця
sdk.data.player.name.watch((name) => {
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId && players[currentPlayerId]) {
    players[currentPlayerId].name = name;
    updatePlayersUI();
  }
});

// Відстеження техніки гравця
sdk.data.battle.vehicle.name.watch((vehicleName) => {
  if (!currentBattleStats.isActive || !vehicleName) return;
  
  const currentPlayerId = sdk.data.player.id.value;
  if (currentPlayerId) {
    if (!currentBattleStats.vehicles[currentPlayerId]) {
      currentBattleStats.vehicles[currentPlayerId] = {};
    }
    currentBattleStats.vehicles[currentPlayerId].name = vehicleName;
  }
});

// Відстеження назви мапи
sdk.data.battle.mapName.watch((mapName) => {
  if (currentBattleStats.isActive && mapName) {
    currentBattleStats.map = mapName;
  }
});

// Відстеження входу/виходу з бою
sdk.data.battle.isInBattle.watch((inBattle) => {
  if (inBattle && !currentBattleStats.isActive) {
    // Гравець увійшов в бій
    currentBattleStats.isActive = true;
    
    // Збільшуємо лічильник боїв при вході в бій
    teamStats.battles++;
    
    // Зберігаємо початковий стан перед боєм для історії
    const stateBefore = {
      players: JSON.parse(JSON.stringify(players)),
      teamStats: JSON.parse(JSON.stringify(teamStats))
    };
    
    // Додаємо новий запис у історію боїв
    battleHistory.push({
      timestamp: Date.now(),
      stateBefore: stateBefore,
      isComplete: false // Позначаємо, що бій ще не завершений
    });
    
    saveInitialBattleStats();
    
    // Оновлюємо UI, щоб відобразити новий лічильник боїв
    updatePlayersUI();
    
    console.log("Бій розпочався");
  } else if (!inBattle && currentBattleStats.isActive) {
    // Гравець вийшов з бою (але результати ще не отримані)
    currentBattleStats.isActive = false;
    console.log("Бій завершився");
  }
});

// Відстеження шкоди для поточного гравця через efficiency
sdk.data.battle.efficiency.damage.watch((newDamage, oldDamage) => {
  if (!currentBattleStats.isActive) return;
  
  if (newDamage > oldDamage) {
    const currentPlayerId = sdk.data.player.id.value;
    const additionalDamage = newDamage - oldDamage;
    
    // Оновлюємо статистику поточного гравця
    if (currentPlayerId) {
      const player = initPlayer(currentPlayerId, sdk.data.player.name.value);
      player.damage += additionalDamage;
      
      // Оновлюємо UI
      updatePlayersUI();
      
      // Зберігаємо в localStorage
      saveStats();
    }
  }
});

// Спеціальна функція для оновлення фрагів гравця
function updatePlayerKill(playerId, playerName) {
  if (!currentBattleStats.isActive || !playerId) return;
  
  // Отримуємо або створюємо запис гравця
  const player = initPlayer(playerId, playerName);
  
  // Збільшуємо кількість фрагів
  player.kills += 1;
  
  // Відстежуємо фраги в поточному бою
  if (!currentBattleStats.fragsThisBattle[playerId]) {
    currentBattleStats.fragsThisBattle[playerId] = 0;
  }
  currentBattleStats.fragsThisBattle[playerId] += 1;
  
  // Оновлюємо UI
  updatePlayersUI();
  
  // Зберігаємо в localStorage
  saveStats();
}

// Відстеження фрагів через PlayerFeedback
sdk.data.battle.onPlayerFeedback.watch(feedback => {
  if (!currentBattleStats.isActive || !feedback) return;
  
  // VEHICLE_KILL вказує на знищення танка
  if (feedback.type === 'VEHICLE_KILL') {
    const currentPlayerId = sdk.data.player.id.value;
    if (currentPlayerId && platoonIds.has(currentPlayerId)) {
      updatePlayerKill(currentPlayerId, sdk.data.player.name.value);
    }
  }
});

// Обробка результатів бою
sdk.data.battle.onBattleResult.watch(result => {
  if (!result || !result.vehicles || !result.players) {
    console.error("Invalid battle result data");
    return;
  }
  
  // Перевірка на перемогу (лише один раз для всієї команди)
  const currentPlayerId = sdk.data.player.id.value;
  let isVictory = false;
  
  if (result.players[currentPlayerId] && result.common && result.common.winnerTeam) {
    if (parseInt(result.players[currentPlayerId].team) === parseInt(result.common.winnerTeam)) {
      // Додаємо перемогу для всієї команди (а не для кожного гравця окремо)
      teamStats.victories++;
      isVictory = true;
    }
  }
  
  // Обробляємо результати для кожного гравця у взводі
  Array.from(platoonIds).forEach(playerId => {
    // Перевіряємо, чи є дані про гравця
    if (!result.players[playerId]) return;
    
    const playerData = players[playerId];
    if (!playerData) return;
    
    // Фіксуємо бій
    playerData.battles++;
    
    // Для гравців, які НЕ є поточним гравцем (інші члени взводу),
    // оновлюємо статистику з результатів бою
    if (playerId !== currentPlayerId) {
      // Шукаємо техніку гравця і отримуємо статистику
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            playerData.damage += vehicle.damageDealt || 0;
            playerData.kills += vehicle.kills || 0;
            break;
          }
        }
      }
    } else {
      // Для поточного гравця - шкода вже оновлена в реальному часі
      // Перевіряємо фраги - якщо в результатах більше, ніж відстежено в бою, оновлюємо
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            const fragsInBattle = currentBattleStats.fragsThisBattle[playerId] || 0;
            const fragsInResult = vehicle.kills || 0;
            
            // Якщо фрагів в результатах більше, додаємо різницю
            if (fragsInResult > fragsInBattle) {
              playerData.kills += (fragsInResult - fragsInBattle);
            }
            
            break;
          }
        }
      }
    }
  });
  
  // Оновлюємо запис в історії
  if (battleHistory.length > 0) {
    const lastBattleIndex = battleHistory.length - 1;
    const lastBattle = battleHistory[lastBattleIndex];
    
    // Оновлюємо останній запис, якщо він не був завершений
    if (!lastBattle.isComplete) {
      lastBattle.stateAfter = {
        players: JSON.parse(JSON.stringify(players)),
        teamStats: JSON.parse(JSON.stringify(teamStats))
      };
      lastBattle.isComplete = true;
      
      // Додаємо інформацію про бій
      const battleLogId = Date.now().toString();
      lastBattle.battleLogId = battleLogId;
      
      battleHistory[lastBattleIndex] = lastBattle;
      
      // Обмежуємо довжину історії (зберігаємо останні 10 боїв)
      if (battleHistory.length > 10) {
        battleHistory.shift();
      }
      
      // Зберігаємо історію
      localStorage.setItem('wotPlatoonBattleHistory', JSON.stringify(battleHistory));
    }
  }
  
  // Створюємо детальний запис про бій для зовнішнього зберігання
  const battleDetails = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    map: currentBattleStats.map || "Unknown Map",
    victory: isVictory,
    players: {},
    duration: Math.floor((Date.now() - currentBattleStats.startTime) / 1000) || 0
  };
  
  // Додаємо дані кожного гравця з взводу
  Array.from(platoonIds).forEach(playerId => {
    if (!result.players[playerId]) return;
    const playerData = players[playerId];
    if (!playerData) return;
    
    let playerVehicle = "Unknown Vehicle";
    // Знаходимо інформацію про техніку гравця
    for (const vehicleId in result.vehicles) {
      const vehicles = result.vehicles[vehicleId];
      for (const vehicle of vehicles) {
        if (vehicle.accountDBID === playerId) {
          playerVehicle = vehicle.vehicleName || playerVehicle;
          break;
        }
      }
    }
    
    // Розраховуємо шкоду в цьому бою
    let playerDamage = 0;
    if (playerId === currentPlayerId) {
      const initialDamage = currentBattleStats.playersInitialDamage[playerId] || 0;
      playerDamage = playerData.damage - initialDamage;
    } else {
      // Для інших гравців шукаємо шкоду в результатах
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            playerDamage = vehicle.damageDealt || 0;
            break;
          }
        }
      }
    }
    
    // Розраховуємо фраги в цьому бою
    let playerFrags = 0;
    if (playerId === currentPlayerId) {
      playerFrags = currentBattleStats.fragsThisBattle[playerId] || 0;
    } else {
      // Для інших гравців шукаємо фраги в результатах
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            playerFrags = vehicle.kills || 0;
            break;
          }
        }
      }
    }
    
    // Додаємо детальну інформацію про гравця
    battleDetails.players[playerId] = {
      name: playerData.name,
      damage: playerDamage,
      frags: playerFrags,
      vehicle: playerVehicle
    };
  });
  
  // Відправляємо дані бою до зовнішнього сховища
  sendBattleDataToExternalStorage(battleDetails);
  
  updatePlayersUI();
  
  // Зберігаємо дані в localStorage для збереження між оновленнями
  saveStats();
});

// Функція для збереження даних бою через GitHub Issue
function sendBattleDataToExternalStorage(battleData) {
  try {
    // Створюємо заголовок та тіло issue
    const issueTitle = `Add battle data for ${new Date().toISOString().split('T')[0]}`;
    const issueBody = JSON.stringify(battleData, null, 2);
    
    // Створюємо URL для створення issue
    const issueUrl = `https://github.com/juniorapi/testwot/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=battle-data`;
    
    // Відкриваємо нове вікно для створення issue
    window.open(issueUrl, '_blank');
    
    console.log('Battle data submitted as GitHub issue');
  } catch (e) {
    console.error("Failed to send battle data:", e);
  }
}

// Функція для видалення бою через GitHub Issue
function deleteBattleFromExternalStorage(battleId) {
  try {
    // Створюємо заголовок та тіло issue
    const issueTitle = `Delete battle ${battleId}`;
    const issueBody = `Please delete battle with ID: ${battleId}`;
    
    // Створюємо URL для створення issue
    const issueUrl = `https://github.com/juniorapi/testwot/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=delete-battle`;
    
    // Відкриваємо нове вікно для створення issue
    window.open(issueUrl, '_blank');
    
    console.log('Delete request submitted as GitHub issue');
    return true;
  } catch (e) {
    console.error("Failed to submit delete request:", e);
    return false;
  }
}

// Функції для збереження і завантаження статистики
function saveStats() {
  localStorage.setItem('wotPlatoonStats', JSON.stringify({
    players: players,
    teamStats: teamStats,
    platoonIds: Array.from(platoonIds)
  }));
}

function loadStats() {
  const saved = localStorage.getItem('wotPlatoonStats');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      
      // Відновлюємо дані гравців
      if (data.players) {
        Object.assign(players, data.players);
      }
      
      // Відновлюємо командну статистику
      if (data.teamStats) {
        Object.assign(teamStats, data.teamStats);
      }
      
      // Відновлюємо ID гравців взводу
      if (data.platoonIds) {
        data.platoonIds.forEach(id => platoonIds.add(id));
      }
      
      // Відновлюємо історію боїв
      const savedHistory = localStorage.getItem('wotPlatoonBattleHistory');
      if (savedHistory) {
        battleHistory = JSON.parse(savedHistory);
      }
      
      updatePlayersUI();
    } catch (e) {
      console.error("Error loading saved stats:", e);
    }
  }
}
