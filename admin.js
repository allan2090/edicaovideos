const createUserForm = document.getElementById('createUserForm');
const newNameInput = document.getElementById('newName');
const newEmailInput = document.getElementById('newEmail');
const newPasswordInput = document.getElementById('newPassword');
const newRoleInput = document.getElementById('newRole');
const refreshUsersButton = document.getElementById('refreshUsers');
const userListContainer = document.getElementById('userList');
const adminMessage = document.getElementById('adminMessage');
const logoutButton = document.getElementById('logoutButton');

async function fetchProfile() {
  try {
    const response = await fetch('/api/profile');
    if (!response.ok) {
      window.location.href = '/login.html';
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(error);
    window.location.href = '/login.html';
    return null;
  }
}

async function loadUsers() {
  adminMessage.textContent = '';
  userListContainer.textContent = 'Carregando usuários...';

  try {
    const response = await fetch('/api/users');
    if (!response.ok) {
      const errorText = await response.text();
      userListContainer.textContent = errorText || 'Erro ao carregar usuários.';
      return;
    }

    const users = await response.json();
    renderUserList(users);
  } catch (error) {
    console.error(error);
    userListContainer.textContent = 'Erro de conexão ao carregar usuários.';
  }
}

function renderUserList(users) {
  if (!users.length) {
    userListContainer.innerHTML = '<p>Nenhum usuário cadastrado.</p>';
    return;
  }

  const rows = users.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>
        <button class="secondary" data-action="edit" data-id="${user.id}">Editar</button>
        <button class="secondary" data-action="delete" data-id="${user.id}">Excluir</button>
      </td>
    </tr>
  `).join('');

  userListContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Nome</th>
          <th>Email</th>
          <th>Perfil</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  userListContainer.querySelectorAll('button[data-action="edit"]').forEach(button => {
    button.addEventListener('click', () => editUser(Number(button.dataset.id)));
  });

  userListContainer.querySelectorAll('button[data-action="delete"]').forEach(button => {
    button.addEventListener('click', () => deleteUser(Number(button.dataset.id)));
  });
}

async function createUser(event) {
  event.preventDefault();
  adminMessage.textContent = '';

  const name = newNameInput.value.trim();
  const email = newEmailInput.value.trim();
  const password = newPasswordInput.value.trim();
  const role = newRoleInput.value;

  if (!name || !email || !password) {
    adminMessage.textContent = 'Preencha todos os campos para criar usuário.';
    return;
  }

  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });

    if (!response.ok) {
      const errorText = await response.text();
      adminMessage.textContent = errorText || 'Erro ao criar usuário.';
      return;
    }

    newNameInput.value = '';
    newEmailInput.value = '';
    newPasswordInput.value = '';
    newRoleInput.value = 'user';
    adminMessage.textContent = 'Usuário criado com sucesso.';
    loadUsers();
  } catch (error) {
    console.error(error);
    adminMessage.textContent = 'Erro de conexão ao criar usuário.';
  }
}

async function editUser(id) {
  const name = prompt('Nome do usuário:');
  if (name === null) return;

  const email = prompt('Email do usuário:');
  if (email === null) return;

  const role = prompt('Papel do usuário (admin/user):', 'user');
  if (role === null) return;

  const password = prompt('Senha nova (deixe vazio para manter):', '');

  try {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role, password })
    });

    if (!response.ok) {
      const errorText = await response.text();
      adminMessage.textContent = errorText || 'Erro ao atualizar usuário.';
      return;
    }

    adminMessage.textContent = 'Usuário atualizado com sucesso.';
    loadUsers();
  } catch (error) {
    console.error(error);
    adminMessage.textContent = 'Erro de conexão ao atualizar usuário.';
  }
}

async function deleteUser(id) {
  if (!confirm('Deseja realmente excluir este usuário?')) {
    return;
  }

  try {
    const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const errorText = await response.text();
      adminMessage.textContent = errorText || 'Erro ao excluir usuário.';
      return;
    }

    adminMessage.textContent = 'Usuário removido com sucesso.';
    loadUsers();
  } catch (error) {
    console.error(error);
    adminMessage.textContent = 'Erro de conexão ao excluir usuário.';
  }
}

createUserForm.addEventListener('submit', createUser);
refreshUsersButton.addEventListener('click', loadUsers);
logoutButton.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

fetchProfile().then(profile => {
  if (profile) {
    loadUsers();
  }
});
