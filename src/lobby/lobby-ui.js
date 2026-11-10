
/* global document */

export function createLobbyUI(lobby, canvas) {
  const container = document.createElement('div');

  container.className = 'lobby-container';

  container.innerHTML = `
    <div class="lobby-panel">
      <h2>SPACE ARENA</h2>
      <p class="lobby-subtitle">MULTIPLAYER LOBBY</p>

      <label for="playerName">PLAYER NAME</label>

      <input
        id="playerName"
        type="text"
        placeholder="Enter your name..."
        maxlength="20"
        autocomplete="off"
      />

      <label for="roomSelect">SELECT ROOM</label>

      <select id="roomSelect">
        <option value="">Loading rooms...</option>
      </select>

      <p class="lobby-status">
        Connecting to room service...
      </p>

      <button class="lobby-join" disabled>
        JOIN GAME
      </button>
    </div>
  `;

  canvas.insertAdjacentElement(
    'beforebegin',
    container,
  );

  const nameInput = container.querySelector(
    '#playerName',
  );

  const roomSelect = container.querySelector(
    '#roomSelect',
  );

  const status = container.querySelector(
    '.lobby-status',
  );

  const joinButton = container.querySelector(
    '.lobby-join',
  );

  function updateJoinButton() {
    joinButton.disabled =
      !nameInput.value.trim() ||
      !roomSelect.value;
  }

  function updateRooms(event) {
    const rooms = event.detail.rooms;

    const previousSelection = roomSelect.value;

    roomSelect.replaceChildren();

    if (rooms.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No rooms available';

      roomSelect.append(option);

      status.textContent = 'No available rooms';
      updateJoinButton();
      return;
    }

    for (const room of rooms) {
      const option = document.createElement('option');

      option.value = room.id;
      option.textContent =
        `${room.name} (${room.maxPlayers} players)`;

      roomSelect.append(option);
    }

    const previousRoomExists = rooms.some(
      (room) => room.id === previousSelection,
    );

    if (previousRoomExists) {
      roomSelect.value = previousSelection;
    }

    status.textContent =
      `${rooms.length} rooms available`;

    updateJoinButton();
  }

  function showError(event) {
    status.textContent =
      `Connection error: ${event.detail.error.message}`;
  }

  function handleJoin() {
    try {
      lobby.join(
        nameInput.value,
        roomSelect.value,
      );
    } catch (error) {
      status.textContent = error.message;
    }
  }

  function handleNameInput() {
    updateJoinButton();
  }

  function handleRoomChange() {
    updateJoinButton();
  }

  lobby.addEventListener(
    'roomsupdated',
    updateRooms,
  );

  lobby.addEventListener(
    'roomserror',
    showError,
  );

  nameInput.addEventListener(
    'input',
    handleNameInput,
  );

  roomSelect.addEventListener(
    'change',
    handleRoomChange,
  );

  joinButton.addEventListener(
    'click',
    handleJoin,
  );

  function show() {
    container.style.display = 'block';
    canvas.style.display = 'none';

    status.textContent = 'Loading rooms...';

    lobby.show();
    nameInput.focus();
  }

  function hide() {
    container.style.display = 'none';
    canvas.style.display = 'block';
  }

  function destroy() {
    lobby.removeEventListener(
      'roomsupdated',
      updateRooms,
    );

    lobby.removeEventListener(
      'roomserror',
      showError,
    );

    nameInput.removeEventListener(
      'input',
      handleNameInput,
    );

    roomSelect.removeEventListener(
      'change',
      handleRoomChange,
    );

    joinButton.removeEventListener(
      'click',
      handleJoin,
    );

    container.remove();
  }

  container.style.display = 'none';

  return {
    show,
    hide,
    destroy,
  };
}
