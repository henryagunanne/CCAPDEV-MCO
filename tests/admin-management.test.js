const { randomUUID } = require('crypto');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { rolePermissions } = require('../config/rbac');

describe('Administrator management', () => {
  let agent;
  let csrfToken;
  let provisionedAdmin;

  async function refreshCsrfToken(targetAgent = agent) {
    const response = await targetAgent.get('/');
    const match = response.text.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) throw new Error('CSRF token was not rendered.');
    return match[1];
  }

  async function signIn(targetAgent, email, password) {
    let token = await refreshCsrfToken(targetAgent);
    await targetAgent.post('/users/login')
      .set('x-csrf-token', token)
      .send({ email, password })
      .expect(200);
    return refreshCsrfToken(targetAgent);
  }

  beforeEach(async () => {
    const suffix = randomUUID();
    agent = request.agent(app);
    provisionedAdmin = await User.create({
      firstName: 'Provisioned',
      lastName: 'Administrator',
      email: `provisioned-${suffix}@example.test`,
      password: 'ProvisionedPass#2026',
      role: 'Admin',
      roles: Object.keys(rolePermissions).filter((roleName) => roleName !== 'user'),
      permissions: [...new Set(Object.values(rolePermissions).flat())],
      isProvisionedAdmin: true,
      mfaEnabled: true,
      mfaVerified: true
    });
    csrfToken = await signIn(agent, provisionedAdmin.email, 'ProvisionedPass#2026');
    const signedInAdmin = await User.findById(provisionedAdmin._id);
    expect(signedInAdmin.lastLoginAt).toBeInstanceOf(Date);
  });

  test('creates an employed administrator with a one-time password setup link', async () => {
    const suffix = randomUUID();
    const response = await agent.post('/admin/management')
      .set('x-csrf-token', csrfToken)
      .type('form')
      .send({
        firstName: 'Employed',
        lastName: 'Administrator',
        email: `employed-${suffix}@example.test`,
        assignedRole: 'reservation_support_admin',
        status: 'active',
        confirmed: 'true'
      })
      .expect(201);

    expect(response.text).toContain('One-time setup link');
    const inviteValueMatch = response.text.match(/id="administratorInvite"[^>]*value="([^"]+)"/);
    expect(inviteValueMatch).not.toBeNull();
    const inviteValue = inviteValueMatch[1].replace(/&#x3D;/g, '=');
    const inviteMatch = inviteValue.match(/#token=([A-Za-z0-9_-]+)/);
    expect(inviteMatch).not.toBeNull();

    const account = await User.findOne({ email: `employed-${suffix}@example.test` });
    expect(account).toMatchObject({
      role: 'Admin',
      roles: ['reservation_support_admin'],
      status: 'active',
      mustSetPassword: true,
      mfaEnabled: true,
      mfaVerified: false
    });
    expect(response.text).not.toContain(account.password);

    const inviteAgent = request.agent(app);
    const inviteCsrf = await refreshCsrfToken(inviteAgent);
    const invalidSetup = await inviteAgent.post('/users/admin-setup')
      .set('x-csrf-token', inviteCsrf)
      .send({ token: inviteMatch[1], password: 'WeakPass12', confirmPassword: 'WeakPass12' })
      .expect(400);
    expect(invalidSetup.text).toContain('name="token"');
    expect(invalidSetup.text).toContain(inviteMatch[1]);

    const setupResponse = await inviteAgent.post('/users/admin-setup')
      .set('x-csrf-token', inviteCsrf)
      .send({
        token: inviteMatch[1],
        password: 'EmployedPass#2026',
        confirmPassword: 'EmployedPass#2026'
      })
      .expect(200);

    expect(setupResponse.text).toContain('Your password is set');
    const updatedAccount = await User.findById(account._id);
    expect(updatedAccount.mustSetPassword).toBe(false);
    expect(await updatedAccount.comparePassword('EmployedPass#2026')).toBe(true);
    expect(await AuditLog.exists({
      action: 'admin:account:create',
      resourceId: String(account._id),
      resourceType: 'Administrator'
    })).not.toBeNull();

    await inviteAgent.post('/users/admin-setup')
      .set('x-csrf-token', inviteCsrf)
      .send({
        token: inviteMatch[1],
        password: 'AnotherPass#2026',
        confirmPassword: 'AnotherPass#2026'
      })
      .expect(400);
  });

  test('limits employed role managers to roles within their own authority', async () => {
    const suffix = randomUUID();
    const manager = await User.create({
      firstName: 'Role',
      lastName: 'Manager',
      email: `manager-${suffix}@example.test`,
      password: 'ManagerPass#2026',
      role: 'Admin',
      roles: ['user_access_admin'],
      mfaEnabled: true,
      mfaVerified: true
    });
    const target = await User.create({
      firstName: 'Flight',
      lastName: 'Administrator',
      email: `flight-admin-${suffix}@example.test`,
      password: 'FlightPass#2026',
      role: 'Admin',
      roles: ['flight_operations_admin'],
      mfaEnabled: true,
      mfaVerified: true
    });
    const managerAgent = request.agent(app);
    const managerCsrf = await signIn(managerAgent, manager.email, 'ManagerPass#2026');

    await managerAgent.get('/admin/management').expect(200);
    await managerAgent.post(`/admin/management/${target._id}/role`)
      .set('x-csrf-token', managerCsrf)
      .type('form')
      .send({ assignedRole: 'flight_operations_admin' })
      .expect(403);
    await managerAgent.post(`/admin/management/${target._id}/role`)
      .set('x-csrf-token', managerCsrf)
      .type('form')
      .send({ assignedRole: 'data_protection_officer' })
      .expect(403);
  });

  test('denies administrator management to roles without the management permission', async () => {
    const suffix = randomUUID();
    const flightAdmin = await User.create({
      firstName: 'Flight',
      lastName: 'Operator',
      email: `operator-${suffix}@example.test`,
      password: 'OperatorPass#2026',
      role: 'Admin',
      roles: ['flight_operations_admin'],
      mfaEnabled: true,
      mfaVerified: true
    });
    const flightAgent = request.agent(app);
    await signIn(flightAgent, flightAdmin.email, 'OperatorPass#2026');

    const dashboard = await flightAgent.get('/admin').expect(200);
    expect(dashboard.text).not.toContain('Manage Administrators');
    await flightAgent.get('/admin/management').expect(403);
    await flightAgent.get('/admin/management/new').expect(403);
  });

  test('requires a new sign-in after an administrator role changes', async () => {
    const suffix = randomUUID();
    const target = await User.create({
      firstName: 'Session',
      lastName: 'Administrator',
      email: `session-admin-${suffix}@example.test`,
      password: 'SessionPass#2026',
      role: 'Admin',
      roles: ['flight_operations_admin'],
      mfaEnabled: true,
      mfaVerified: true
    });
    const targetAgent = request.agent(app);
    await signIn(targetAgent, target.email, 'SessionPass#2026');

    await agent.post(`/admin/management/${target._id}/role`)
      .set('x-csrf-token', csrfToken)
      .type('form')
      .send({ assignedRole: 'finance_admin', confirmed: 'true' })
      .expect(302);

    await targetAgent.get('/admin').expect(403);
    const updatedTarget = await User.findById(target._id);
    expect(updatedTarget.roles).toEqual(['finance_admin']);
    expect(updatedTarget.sessionVersion).toBe(1);
  });

  test('deactivates an employed administrator and blocks their existing admin session', async () => {
    const suffix = randomUUID();
    const target = await User.create({
      firstName: 'Status',
      lastName: 'Administrator',
      email: `status-admin-${suffix}@example.test`,
      password: 'StatusPass#2026',
      role: 'Admin',
      roles: ['reservation_support_admin'],
      mfaEnabled: true,
      mfaVerified: true
    });
    const targetAgent = request.agent(app);
    await signIn(targetAgent, target.email, 'StatusPass#2026');

    await agent.post(`/admin/management/${target._id}/status`)
      .set('x-csrf-token', csrfToken)
      .type('form')
      .send({ status: 'disabled', confirmed: 'true' })
      .expect(302);

    await targetAgent.get('/admin').expect(403);
    const disabledTarget = await User.findById(target._id);
    expect(disabledTarget.status).toBe('disabled');
    expect(disabledTarget.sessionVersion).toBe(1);

    await agent.post(`/admin/management/${provisionedAdmin._id}/status`)
      .set('x-csrf-token', csrfToken)
      .type('form')
      .send({ status: 'disabled', confirmed: 'true' })
      .expect(404);
  });

  test('prevents deletion of the provisioned administrator through the ordinary account endpoint', async () => {
    await agent.post(`/users/delete/${provisionedAdmin._id}`)
      .set('x-csrf-token', csrfToken)
      .send({ currentPassword: 'ProvisionedPass#2026' })
      .expect(403);

    expect(await User.exists({ _id: provisionedAdmin._id })).not.toBeNull();
  });
});
