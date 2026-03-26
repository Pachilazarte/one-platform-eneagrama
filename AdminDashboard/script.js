/**
 * 📊 LÓGICA DEL DASHBOARD DE ADMINISTRADOR
 * Gestión de usuarios y habilitación para el test Eneagrama
 * ─────────────────────────────────────────────────────
 * FILTRO: Los usuarios se traen por Usuario_Admin (identificador único)
 * NO se usa la contraseña del admin como filtro.
 *
 * ESTADÍSTICAS:
 * - "Pendientes de Test" y "Tests Completados" se determinan
 *   consultando la hoja de Respuestas (CONFIG.api.informes)
 *   para verificar si el usuario tiene respuestas registradas.
 */

// Proteger la página - Solo Admin
Auth.protectPage(CONFIG.roles.ADMIN);

let usersData = [];
let filteredData = [];
// ✅ Mapa de usuarios que completaron el test (desde hoja Respuestas)
let completedUsersMap = {};

document.addEventListener('DOMContentLoaded', function () {
    loadUserInfo();
    loadUsers();
    setupEventListeners();
});

/* =========================================================
   INFO DEL ADMIN LOGUEADO (Actualizado para Pack 01)
   ========================================================= */
function loadUserInfo() {
    var session = Auth.getSession();
    if (session) {
        document.getElementById('userInfo').textContent = session.userName + ' (' + session.userEmail + ')';
        
        const packContainer = document.getElementById('packLiderContainer');
        if (packContainer) {
            // ✅ CORRECCIÓN: Aceptamos "01" o "1"
            if (session.packStatus === "01" || session.packStatus === "1") {
                packContainer.classList.remove('hidden');
            } else {
                packContainer.classList.add('hidden');
            }
        }
    }
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */
function setupEventListeners() {
    var form = document.getElementById('newUserForm');
    if (form) form.addEventListener('submit', handleCreateUser);

    var editForm = document.getElementById('editUserForm');
    if (editForm) editForm.addEventListener('submit', handleEditUser);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeEditModal();
            closeConfirmModal();
        }
    });

    // Botón loading visual
    var btn = document.getElementById('btnCrearUsuario');
    var txtN = document.getElementById('btnCrearTexto');
    var txtL = document.getElementById('btnCrearLoading');
    var lc = document.getElementById('loadingContainer');

    function setLoading(on) {
        if (btn) btn.disabled = on;
        if (txtN) txtN.classList.toggle('hidden', on);
        if (txtL) txtL.classList.toggle('hidden', !on);
    }

    if (form) {
        form.addEventListener('submit', function () { setLoading(true); });
        form.addEventListener('submit', function () {
            setTimeout(function () { setLoading(false); }, 15000);
        });
    }

    if (lc) {
        new MutationObserver(function () {
            if (lc.classList.contains('hidden')) setLoading(false);
        }).observe(lc, { attributes: true, attributeFilter: ['class'] });
    }
}

/* =========================================================
   CARGAR USUARIOS - FILTRO SOLO POR Usuario_Admin
   ========================================================= */
async function loadUsers() {
    Helpers.showLoading(true);
    var session = Auth.getSession();

    try {
        // ══════════════════════════════════════════════
        // PASO 1: Cargar usuarios del admin
        // ══════════════════════════════════════════════
        var response = await Helpers.fetchGET(CONFIG.api.gestionAdmin);

        if (Array.isArray(response)) {
            usersData = response
                .filter(function (row) {
                    return String(row.Usuario_Admin || '').trim() === String(session.userName).trim()
                        && row.User
                        && String(row.User).trim() !== '';
                })
.map(function (row) {
    return {
        usuario: String(row.User || ''),
        password: String(row.Pass_User || ''),
        email: String(row.Email_User || ''),
        nombre: String(row.Nombre_User || ''),
        estado: String(row.Estado_User || 'activo').toLowerCase(),
        // ✅ Capturamos el identificador "01" de la Columna H
        // Buscá esta línea y cambiala:
packStatus: String(row.Pack_Status || '').trim(), // <--- Cambiá Pack_Lider por Pack_Status
        testCompletado: false
    };
});

            // ══════════════════════════════════════════════
            // PASO 2: Consultar hoja de Respuestas para
            //         saber quién completó el test
            // ══════════════════════════════════════════════
            await checkTestCompletionForAllUsers();

            filteredData = usersData.slice();
            renderUsersTable();
            updateStats();
        } else {
            Helpers.showAlert('Error al cargar usuarios', 'error');
        }

    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        Helpers.showAlert('Error de conexión al cargar usuarios', 'error');
    } finally {
        Helpers.showLoading(false);
    }
}

/* =========================================================
   ✅ VERIFICAR TEST COMPLETADO - CONSULTA HOJA RESPUESTAS
   =========================================================
   Recorre cada usuario y consulta CONFIG.api.informes
   para ver si tiene respuestas registradas.
   ========================================================= */
async function checkTestCompletionForAllUsers() {
    completedUsersMap = {};

    // Crear promesas para consultar cada usuario en paralelo
    var promises = usersData.map(function (user) {
        return checkSingleUserTest(user.usuario);
    });

    try {
        await Promise.all(promises);
    } catch (err) {
        console.warn('Error parcial verificando tests:', err);
    }

    // Actualizar el flag en usersData
    usersData.forEach(function (user) {
        user.testCompletado = !!completedUsersMap[user.usuario.trim().toLowerCase()];
    });
}

async function checkSingleUserTest(userName) {
    try {
        var response = await fetch(
            CONFIG.api.informes + '?user=' + encodeURIComponent(userName)
        );

        if (!response.ok) return;

        var result = await response.json();

        if (result.success && result.data) {
            var userData = result.data;
            // Si tiene Respuestas con contenido → completó el test
            if (userData.Respuestas && String(userData.Respuestas).trim() !== '') {
                completedUsersMap[userName.trim().toLowerCase()] = true;
            }
        }
    } catch (err) {
        console.warn('Error verificando test para ' + userName + ':', err);
    }
}

/* =========================================================
   BÚSQUEDA / FILTRO
   ========================================================= */
function filterUsers() {
    var query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!query) {
        filteredData = usersData.slice();
    } else {
        filteredData = usersData.filter(function (u) {
            return u.usuario.toLowerCase().includes(query)
                || u.email.toLowerCase().includes(query)
                || u.nombre.toLowerCase().includes(query);
        });
    }
    renderUsersTable();
}

/* =========================================================
    CREAR USUARIO - VERSIÓN FINAL INTEGRADA
   ========================================================= */

async function handleCreateUser(e) {
    e.preventDefault();

    var usuario = document.getElementById('userUsuario').value.trim();
    var password = document.getElementById('userPassword').value;
    var email = document.getElementById('userEmail').value.trim();
    var nombre = document.getElementById('userNombre').value.trim();
    var session = Auth.getSession();

    // ✅ CAPTURA PREVIA: Obtenemos el valor antes de entrar al modal de confirmación
    var chkPack = document.getElementById('chkPackLider');
    var packValue = (chkPack && chkPack.checked) ? '01' : '';

    // Validaciones estándar
    if (!usuario || !password || !email || !nombre) {
        Helpers.showAlert('Todos los campos son obligatorios', 'error');
        return;
    }
    if (!Helpers.validateEmail(email)) {
        Helpers.showAlert('Email inválido', 'error');
        return;
    }
    if (password.length < 6) {
        Helpers.showAlert('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    if (!session || !session.userName || !session.userEmail) {
        Helpers.showAlert('Error de sesión. Vuelve a iniciar sesión.', 'error');
        return;
    }

    // Verificar duplicado
    var existe = usersData.some(function (u) {
        return u.usuario.toLowerCase() === usuario.toLowerCase();
    });
    if (existe) {
        showToast('El usuario "' + usuario + '" ya existe', 'error');
        return;
    }

    showConfirmModal({
        title: 'Crear Usuario',
        message: '¿Estás seguro de crear al usuario <strong>' + sanitize(usuario) + '</strong>?',
        icon: 'create',
        btnClass: 'bg-gradient-to-r from-one-cyan/30 to-one-pink/30 border border-one-cyan/50',
        onConfirm: function () {
            // ✅ PASO DE PARÁMETRO: Enviamos packValue como 7mo argumento
            doCreateUser(usuario, password, email, nombre, session, e.target, packValue);
        }
    });
}

async function doCreateUser(usuario, password, email, nombre, session, form, packValue) {
    Helpers.showLoading(true);

    try {
        var payload = {
            fila: [
                session.userName,     // Col A: Usuario_Admin
                session.userEmail,    // Col B: Email_Admin
                usuario,              // Col C: User
                password,             // Col D: Pass_User
                email,                // Col E: Email_User
                nombre,               // Col F: Nombre_User
                'activo',             // Col G: Estado_User
                packValue             // Col H: Pack_Lider (Valor "01" o "")
            ]
        };

        var formData = new URLSearchParams();
        formData.append('data', JSON.stringify(payload));

        var response = await fetch(CONFIG.api.gestionAdmin, {
            method: 'POST',
            body: formData
        });

        var result = await response.json();

        if (result && result.status === 'success') {
            showToast('Usuario "' + usuario + '" creado exitosamente', 'success');
            
            // Limpieza completa
            form.reset();
            var chkPack = document.getElementById('chkPackLider');
            if (chkPack) chkPack.checked = false;

            showCredentialsModal(usuario, password, email);
            setTimeout(function () { loadUsers(); }, 1500);
        } else {
            var msg = (result && result.message) ? result.message : 'Respuesta inválida del servidor';
            Helpers.showAlert('Error al crear usuario: ' + msg, 'error');
        }

    } catch (error) {
        console.error('Error al crear usuario:', error);
        Helpers.showAlert('Error de conexión al crear usuario', 'error');
    } finally {
        Helpers.showLoading(false);
    }
}
/* =========================================================
   EDITAR USUARIO
   ========================================================= */
function openEditModal(usuario) {
    var user = usersData.find(function (u) { return u.usuario === usuario; });
    if (!user) return;

    document.getElementById('editOriginalUsuario').value = usuario;
    document.getElementById('editUsuario').value = user.usuario;
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editNombre').value = user.nombre;
    document.getElementById('editPassword').value = '';

    var modal = document.getElementById('editModal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    void modal.offsetHeight;
    modal.classList.add('modal-visible');
}

function closeEditModal() {
    var modal = document.getElementById('editModal');
    if (!modal) return;
    modal.classList.remove('modal-visible');
    setTimeout(function () {
        modal.classList.add('hidden');
        modal.style.display = '';
    }, 300);
}

function handleEditUser(e) {
    e.preventDefault();

    var originalUsuario = document.getElementById('editOriginalUsuario').value;
    var nuevoEmail = document.getElementById('editEmail').value.trim();
    var nuevoNombre = document.getElementById('editNombre').value.trim();
    var nuevaPass = document.getElementById('editPassword').value;

    if (!nuevoEmail) {
        showToast('El Email es obligatorio', 'error');
        return;
    }

    showConfirmModal({
        title: 'Guardar Cambios',
        message: '¿Confirmas los cambios para <strong>' + sanitize(originalUsuario) + '</strong>?',
        icon: 'edit',
        btnClass: 'bg-gradient-to-r from-one-cyan/30 to-one-pink/30 border border-one-cyan/50',
        onConfirm: function () {
            closeEditModal();
            doEditUser(originalUsuario, nuevoEmail, nuevoNombre, nuevaPass);
        }
    });
}

async function doEditUser(usuario, nuevoEmail, nuevoNombre, nuevaPass) {
    Helpers.showLoading(true);
    try {
        var payload = {
            accion: 'editarUser',
            usuario: usuario,
            adminId: Auth.getSession().userName,
            nuevoEmail: nuevoEmail,
            nuevoNombre: nuevoNombre,
            nombreHoja: 'Users'
        };
        if (nuevaPass) payload.nuevaPass = nuevaPass;

        var formData = new URLSearchParams();
        formData.append('data', JSON.stringify(payload));

        var response = await fetch(CONFIG.api.gestionAdmin, {
            method: 'POST',
            body: formData
        });
        var result = await response.json();

        if (result && result.status === 'success') {
            showToast('Usuario "' + usuario + '" actualizado correctamente', 'success');
            loadUsers();
        } else {
            Helpers.showAlert('Error: ' + (result.message || 'Error desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error al editar:', error);
        Helpers.showAlert('Error de conexión', 'error');
    } finally {
        Helpers.showLoading(false);
    }
}

/* =========================================================
   INACTIVAR / ACTIVAR USUARIO
   ========================================================= */
function toggleUserStatus(usuario, estadoActual) {
    var nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
    var accionTexto = nuevoEstado === 'inactivo' ? 'inactivar' : 'activar';

    showConfirmModal({
        title: (nuevoEstado === 'inactivo' ? 'Inactivar' : 'Activar') + ' Usuario',
        message: '¿Deseas <strong>' + accionTexto + '</strong> al usuario <strong>' + sanitize(usuario) + '</strong>?',
        icon: nuevoEstado === 'inactivo' ? 'deactivate' : 'activate',
        btnClass: nuevoEstado === 'inactivo'
            ? 'bg-red-500/30 border border-red-500/50 text-red-300'
            : 'bg-green-500/30 border border-green-500/50 text-green-300',
        onConfirm: function () {
            doToggleUserStatus(usuario, nuevoEstado);
        }
    });
}

async function doToggleUserStatus(usuario, nuevoEstado) {
    Helpers.showLoading(true);
    try {
        var payload = {
            accion: 'toggleUserStatus',
            usuario: usuario,
            adminId: Auth.getSession().userName,
            nuevoEstado: nuevoEstado,
            nombreHoja: 'Users'
        };

        var formData = new URLSearchParams();
        formData.append('data', JSON.stringify(payload));

        var response = await fetch(CONFIG.api.gestionAdmin, {
            method: 'POST',
            body: formData
        });
        var result = await response.json();

        if (result && result.status === 'success') {
            showToast('Estado de "' + usuario + '" cambiado a ' + nuevoEstado, 'success');
            loadUsers();
        } else {
            Helpers.showAlert('Error: ' + (result.message || 'Error desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        Helpers.showAlert('Error de conexión', 'error');
    } finally {
        Helpers.showLoading(false);
    }
}

/* =========================================================
   RESET PASSWORD
   ========================================================= */
function resetUserPassword(usuario) {
    var nuevaPass = prompt('Ingresa la nueva contraseña para ' + usuario + ':');
    if (!nuevaPass) return;
    if (nuevaPass.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    showConfirmModal({
        title: 'Resetear Contraseña',
        message: '¿Confirmas el cambio de contraseña para <strong>' + sanitize(usuario) + '</strong>?',
        icon: 'edit',
        btnClass: 'bg-yellow-500/30 border border-yellow-500/50 text-yellow-300',
        onConfirm: function () {
            doResetUserPassword(usuario, nuevaPass);
        }
    });
}

async function doResetUserPassword(usuario, nuevaPass) {
    Helpers.showLoading(true);
    try {
        var payload = {
            accion: 'resetUserPass',
            usuario: usuario,
            adminId: Auth.getSession().userName,
            nuevaPass: nuevaPass,
            nombreHoja: 'Users'
        };

        var formData = new URLSearchParams();
        formData.append('data', JSON.stringify(payload));

        var response = await fetch(CONFIG.api.gestionAdmin, {
            method: 'POST',
            body: formData
        });
        var result = await response.json();

        if (result && result.status === 'success') {
            showToast('Contraseña de "' + usuario + '" actualizada', 'success');
            loadUsers();
        } else {
            Helpers.showAlert('Error: ' + (result.message || 'Error desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error al resetear pass:', error);
        Helpers.showAlert('Error de conexión', 'error');
    } finally {
        Helpers.showLoading(false);
    }
}

/* =========================================================
    RENDER: Tabla de Usuarios (Versión Pro con Pack Líder)
   ========================================================= */
function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    // 1. Validamos los permisos del Admin logueado (Vos)
    const session = Auth.getSession();
    const isAdminLider = (session && (session.packStatus === "01" || session.packStatus === "1"));

    // 2. Sincronizamos el encabezado de la tabla (la columna 5 es Pack Líder)
    const thPack = document.querySelector('thead th:nth-child(5)');
    if (thPack) {
        thPack.style.display = isAdminLider ? '' : 'none';
    }

    const data = filteredData && filteredData.length ? filteredData : [];

    // 3. Manejo de tabla vacía (Ajustamos colspan a 8)
    if (data.length === 0) {
        const searchVal = document.getElementById('searchInput')?.value.trim() || '';
        const msg = searchVal ? `No se encontraron resultados para "${sanitize(searchVal)}"` : 'No has creado usuarios aún.';
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-gray-400">${msg}</td></tr>`;
        return;
    }

    // 4. Mapeo de filas
    tbody.innerHTML = data.map(function (user) {
        const estado = user.estado || 'activo';
        const escapedPass = user.password.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        // Verificamos si este usuario final tiene el pack activo
        const isPackEnabled = (user.packStatus === "01" || user.packStatus === "1");

        // Badge visual de "LÍDER" al lado del nombre si tiene el pack
        const badgeLider = isPackEnabled 
            ? '<span class="ml-2 px-2 py-0.5 text-[10px] bg-one-gold/20 text-one-gold border border-one-gold/30 rounded-full font-bold tracking-tight">LÍDER</span>' 
            : '';

        // Badge de estado del test
        const testBadge = user.testCompletado
            ? '<span class="status-badge status-completed">Completado</span>'
            : '<span class="status-badge status-pending">Pendiente</span>';

        // Definimos la celda del Pack Líder (Solo si vos sos Admin Líder)
const packCell = isAdminLider ? `
    <td class="px-6 py-4">
        <div class="flex items-center justify-center gap-3">
            <label class="relative inline-flex items-center cursor-pointer group">
                <input type="checkbox" class="sr-only peer" ${isPackEnabled ? 'checked' : ''} 
                       onchange="toggleUserPack('${sanitize(user.usuario)}', this.checked)">
                <div class="w-11 h-6 bg-white/10 border border-white/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-one-cyan shadow-lg"></div>
            </label>
            <span class="text-[10px] font-bold tracking-widest uppercase ${isPackEnabled ? 'text-one-cyan' : 'text-gray-500'}">
                ${isPackEnabled ? 'Habilitado' : 'Deshabilitado'}
            </span>
        </div>
    </td>` : '<td class="hidden"></td>';

        return `
            <tr class="${estado === 'inactivo' ? 'opacity-60' : ''} transition-all hover:bg-white/[0.02]">
                <td class="px-6 py-4"><div class="flex items-center"><strong>${sanitize(user.usuario)}</strong>${badgeLider}</div></td>
                <td class="px-6 py-4">${sanitize(user.email)}</td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <span class="pass-text font-mono text-sm text-gray-300" data-visible="false">••••••••</span>
                        <button onclick="toggleTablePassword(this, '${escapedPass}')" class="text-gray-400 hover:text-one-cyan p-1 rounded-lg">
                            <svg class="eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                    </div>
                </td>
                <td class="px-6 py-4">${sanitize(user.nombre || '---')}</td>
                ${packCell}
                <td class="px-6 py-4 text-center">
                    <span class="status-badge ${estado === 'activo' ? 'status-active' : 'status-inactive'}">
                        ${estado.charAt(0).toUpperCase() + estado.slice(1)}
                    </span>
                </td>
                <td class="px-6 py-4 text-center">${testBadge}</td>
                <td class="px-6 py-4">
                    <div class="action-buttons justify-center">
                        <button class="btn-action btn-action-edit" onclick="openEditModal('${sanitize(user.usuario)}')" title="Editar">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-action ${estado === 'activo' ? 'btn-action-deactivate' : 'btn-action-activate'}" 
                                onclick="toggleUserStatus('${sanitize(user.usuario)}', '${estado}')">
                            ${estado === 'activo' ? '🚫' : '✅'}
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

/* =========================================================
   ESTADÍSTICAS (basadas en datos reales de Respuestas)
   =========================================================
   - totalUsers: cantidad total de usuarios de este admin
   - activeUsers: con Estado_User = 'activo'
   - pendingUsers: activos que NO completaron el test
   - completedTests: activos que SÍ completaron el test
   ========================================================= */
function updateStats() {
    var total = usersData.length;

    var activos = usersData.filter(function (u) {
        return u.estado === 'activo';
    }).length;

    // ✅ Ahora se basa en el flag real de la hoja Respuestas
    var completados = usersData.filter(function (u) {
        return u.estado === 'activo' && u.testCompletado;
    }).length;

    var pendientes = activos - completados;

    var el;
    el = document.getElementById('totalUsers');
    if (el) el.textContent = String(total);

    el = document.getElementById('activeUsers');
    if (el) el.textContent = String(activos);

    el = document.getElementById('pendingUsers');
    if (el) el.textContent = String(pendientes);

    el = document.getElementById('completedTests');
    if (el) el.textContent = String(completados);
}

/* =========================================================
   VER / OCULTAR CONTRASEÑA EN TABLA
   ========================================================= */
function toggleTablePassword(btn, password) {
    var span = btn.parentElement.querySelector('.pass-text');
    var eyeOpen = btn.querySelector('.eye-open');
    var eyeClosed = btn.querySelector('.eye-closed');

    if (span.dataset.visible === 'false') {
        span.textContent = password;
        span.dataset.visible = 'true';
        eyeOpen.classList.add('hidden');
        eyeClosed.classList.remove('hidden');
    } else {
        span.textContent = '••••••••';
        span.dataset.visible = 'false';
        eyeOpen.classList.remove('hidden');
        eyeClosed.classList.add('hidden');
    }
}

function toggleInputPassword(inputId, btn) {
    var input = document.getElementById(inputId);
    var eyeOpen = btn.querySelector('.eye-open');
    var eyeClosed = btn.querySelector('.eye-closed');

    if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.classList.add('hidden');
        eyeClosed.classList.remove('hidden');
    } else {
        input.type = 'password';
        eyeOpen.classList.remove('hidden');
        eyeClosed.classList.add('hidden');
    }
}

/* =========================================================
   MODAL DE CREDENCIALES (al crear usuario)
   ========================================================= */
function showCredentialsModal(usuario, password, email) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn .2s ease';
    overlay.innerHTML =
        '<div style="background:linear-gradient(145deg,#1e1b23,#2a2730);border:1px solid rgba(107,225,227,0.2);border-radius:20px;padding:32px;max-width:480px;width:92%;box-shadow:0 30px 80px rgba(0,0,0,0.6),0 0 50px rgba(107,225,227,0.06);animation:scaleIn .25s ease">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">' +
                '<div style="width:40px;height:40px;border-radius:50%;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);display:flex;align-items:center;justify-content:center;">' +
                    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
                '</div>' +
                '<h3 style="margin:0;font-family:\'Exo 2\',sans-serif;font-size:1.3rem;font-weight:800;color:#fff;">Usuario Creado</h3>' +
            '</div>' +
            '<div style="background:rgba(107,225,227,0.04);border:1.5px dashed rgba(107,225,227,0.2);border-radius:14px;padding:4px 18px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<span style="font-weight:600;color:#a4a8c0;font-size:0.9rem;">Usuario</span>' +
                    '<code style="font-family:\'Courier New\',monospace;background:rgba(0,0,0,0.5);padding:5px 14px;border-radius:8px;color:#6be1e3;border:1px solid rgba(107,225,227,0.15);font-size:0.9rem;">' + sanitize(usuario) + '</code>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<span style="font-weight:600;color:#a4a8c0;font-size:0.9rem;">Contraseña</span>' +
                    '<code style="font-family:\'Courier New\',monospace;background:rgba(0,0,0,0.5);padding:5px 14px;border-radius:8px;color:#e17bd7;border:1px solid rgba(225,123,215,0.15);font-size:0.9rem;">' + sanitize(password) + '</code>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;">' +
                    '<span style="font-weight:600;color:#a4a8c0;font-size:0.9rem;">Email</span>' +
                    '<code style="font-family:\'Courier New\',monospace;background:rgba(0,0,0,0.5);padding:5px 14px;border-radius:8px;color:#e4c76a;border:1px solid rgba(228,199,106,0.15);font-size:0.9rem;">' + sanitize(email) + '</code>' +
                '</div>' +
            '</div>' +
            '<p style="color:#a4a8c0;font-size:0.85rem;margin:18px 0 22px 0;line-height:1.5;">' +
                '⚠️ Guarda estas credenciales. El usuario las necesitará para acceder al sistema.' +
            '</p>' +
            '<button onclick="this.closest(\'[style*=fixed]\').remove()" ' +
                'style="width:100%;padding:13px;border:1px solid rgba(107,225,227,0.35);background:linear-gradient(135deg,rgba(107,225,227,0.12),rgba(225,123,215,0.12));color:#fff;font-family:\'Exo 2\',sans-serif;font-weight:700;font-size:0.95rem;border-radius:9999px;cursor:pointer;transition:all .2s ease;"' +
                'onmouseover="this.style.borderColor=\'rgba(107,225,227,0.6)\';this.style.boxShadow=\'0 10px 40px rgba(107,225,227,0.15)\'"' +
                'onmouseout="this.style.borderColor=\'rgba(107,225,227,0.35)\';this.style.boxShadow=\'none\'">' +
                'Entendido' +
            '</button>' +
        '</div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
    });
}

/* =========================================================
   MODAL DE CONFIRMACIÓN
   ========================================================= */
var _confirmCallback = null;

function showConfirmModal(opts) {
    var modal = document.getElementById('confirmModal');
    var iconContainer = document.getElementById('confirmIcon');
    var title = document.getElementById('confirmTitle');
    var message = document.getElementById('confirmMessage');
    var btn = document.getElementById('confirmBtn');

    title.textContent = opts.title || 'Confirmar';
    message.innerHTML = opts.message || '';
    btn.className = 'flex-1 px-6 py-2.5 rounded-full transition-all font-bold text-sm cursor-pointer ' + (opts.btnClass || '');

    var iconMap = {
        create: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6be1e3" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
        edit: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6be1e3" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        delete: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        deactivate: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        activate: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    };
    var bgMap = {
        create: 'bg-one-cyan/20', edit: 'bg-one-cyan/20',
        delete: 'bg-red-500/20', deactivate: 'bg-red-500/20', activate: 'bg-green-500/20'
    };

    iconContainer.className = 'mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ' + (bgMap[opts.icon] || 'bg-white/10');
    iconContainer.innerHTML = iconMap[opts.icon] || '';

    _confirmCallback = opts.onConfirm || null;

    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', function () {
        var cb = _confirmCallback;
        _confirmCallback = null;
        closeConfirmModal();
        if (typeof cb === 'function') cb();
    });

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    void modal.offsetHeight;
    modal.classList.add('modal-visible');
}

function closeConfirmModal() {
    var modal = document.getElementById('confirmModal');
    if (!modal) return;
    modal.classList.remove('modal-visible');
    setTimeout(function () {
        modal.classList.add('hidden');
        modal.style.display = '';
    }, 300);
}

/* =========================================================
   TOAST NOTIFICATIONS
   ========================================================= */
function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast-item pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-xl shadow-2xl text-sm font-semibold transform translate-x-full transition-transform duration-300 ' +
        (type === 'success'
            ? 'bg-green-500/20 border-green-500/40 text-green-300'
            : 'bg-red-500/20 border-red-500/40 text-red-300');

    var icon = type === 'success'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

    toast.innerHTML = icon + '<span>' + message + '</span>';
    container.appendChild(toast);

    requestAnimationFrame(function () {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    });

    setTimeout(function () {
        toast.classList.remove('translate-x-0');
        toast.classList.add('translate-x-full');
        setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
}

/* =========================================================
   UTILIDADES
   ========================================================= */
function sanitize(str) {
    if (typeof Helpers !== 'undefined' && Helpers.sanitizeHTML) {
        return Helpers.sanitizeHTML(str);
    }
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}


/* =========================================================
   CAMBIAR PACK LÍDER (MANUAL) PARA USUARIO FINAL
   ========================================================= */
async function toggleUserPack(usuarioUser, isEnabled) {
    const session = Auth.getSession();
    const nuevoValor = isEnabled ? "1" : ""; // Usamos "1" para ser consistentes con tu base actual
    
    showToast('Actualizando permisos...', 'success');

    try {
        var payload = {
            accion: 'editarUserPack', // La acción que agregamos al Apps Script
            usuario: usuarioUser,
            adminId: session.userName, // El ID del admin logueado
            valor: nuevoValor
        };

        var formData = new URLSearchParams();
        formData.append('data', JSON.stringify(payload));

        var response = await fetch(CONFIG.api.gestionAdmin, {
            method: 'POST',
            body: formData
        });

        var result = await response.json();

        if (result && result.status === 'success') {
            showToast('Permisos actualizados correctamente', 'success');
            // Actualizamos el dato local para que no se mueva el switch solo
            const user = usersData.find(u => u.usuario === usuarioUser);
            if (user) user.packStatus = nuevoValor;
        } else {
            throw new Error(result.message || 'Error en el servidor');
        }
    } catch (error) {
        console.error('Error:', error);
        Helpers.showAlert('No se pudo actualizar: ' + error.message, 'error');
        renderUsersTable(); // Revertimos visualmente el switch si falló
    }
}