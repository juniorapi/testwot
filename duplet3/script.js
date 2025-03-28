const { WidgetSDK } = WotstatWidgetsSdk;
const sdk = new WidgetSDK();

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

// Дані для відстеження поточного бою
const currentBattleStats = {
  isActive: false,
  playersInitialDamage: {},
  playersInitialKills: {},
  fragsThisBattle: {},
  map: "",
  startTime: null,
  vehicles: {}
};

// Константи
const POINTS_PER_DAMAGE = 1;
const POINTS_PER_FRAG = 400;
const POINTS_PER_TEAM_WIN = 1000;

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
  
  // Додаємо очки за перемоги для всієї команди
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
    
    // Розрахунок очок для гравця
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
    currentBattleStats.fragsThisBattle[id] = 0;
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
    }
  }
});

// ВИПРАВЛЕННЯ: Відстеження загальної шкоди (включно з блайндшотом)
sdk.data.battle.personal.damageDealt.watch((newDamage, oldDamage) => {
  if (!currentBattleStats.isActive) return;
  
  const currentPlayerId = sdk.data.player.id.value;
  if (!currentPlayerId) return;
  
  // Отримуємо початкове значення шкоди для цього бою
  const initialDamage = currentBattleStats.playersInitialDamage[currentPlayerId] || 0;
  
  // Отримуємо поточне значення шкоди гравця
  const player = players[currentPlayerId];
  if (!player) return;
  
  // Обчислюємо правильну шкоду для відображення
  // Важливо: використовуємо новий damageDealt, який враховує всю шкоду
  if (newDamage !== undefined && newDamage > 0) {
    // Оновлюємо шкоду гравця на основі загальної шкоди з поля damageDealt
    const currentTotalDamage = initialDamage + newDamage;
    
    // Оновлюємо тільки якщо нове значення більше поточного
    if (currentTotalDamage > player.damage) {
      player.damage = currentTotalDamage;
      
      // Оновлюємо UI
      updatePlayersUI();
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
      // Додаємо перемогу для всієї команди
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
      // Для поточного гравця - перевіряємо значення з результатів бою
      for (const vehicleId in result.vehicles) {
        const vehicles = result.vehicles[vehicleId];
        
        for (const vehicle of vehicles) {
          if (vehicle.accountDBID === playerId) {
            // ВИПРАВЛЕННЯ: Враховуємо загальну шкоду з результатів бою
            const damageInResult = vehicle.damageDealt || 0;
            const initialDamage = currentBattleStats.playersInitialDamage[playerId] || 0;
            const currentDamage = playerData.damage;
            
            // Якщо шкода з результатів більша, оновлюємо значення
            const expectedDamage = initialDamage + damageInResult;
            if (expectedDamage > currentDamage) {
              playerData.damage = expectedDamage;
            }
            
            // Також перевіряємо фраги
            const fragsInBattle = currentBattleStats.fragsThisBattle[playerId] || 0;
            const fragsInResult = vehicle.kills || 0;
            
            if (fragsInResult > fragsInBattle) {
              playerData.kills += (fragsInResult - fragsInBattle);
            }
            
            break;
          }
        }
      }
    }
  });
  
  updatePlayersUI();
});

// Завантаження статистики при запуску віджета
function initializeWidget() {
  updatePlayersUI();
}

// Запуск віджета
initializeWidget();
