const agent = global.agent;
const User = require('../models/User');

describe('Authentication Tests', () => {

    // Registration test
    describe('POST /users/register', () => {
        // valid registration test
        it('User Registration - Valid', async () => {
            const res = await agent
                .post('/users/register')
                .send({
                    firstName: 'Test',
                    lastName: 'User',
                    email: 'test@example.com',
                    password: 'password123',
                    dateOfBirth: new Date()
                });
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true)
        });

        // invalid registration test
        it('User Registration - Duplicate Email', async () => {
            // create user first
            await agent.post('/users/register').send({
                firstName: 'Duplicate',
                lastName: 'User',
                email: 'duplicate@test.com',
                password: 'password123',
                dateOfBirth: '1990-01-01'
            });

            // Try to create the same user again
            const res = await agent 
                .post('/users/register')
                .send({
                    firstName: 'Dup',
                    lastName: 'User',
                    email: 'duplicate@test.com', //
                    password: 'password123',
                    dateOfBirth: new Date()
                });

            expect(res.statusCode).toEqual(400);   
            expect(res.body).toHaveProperty('success', false);
            expect(res.body.message).toBe('Email already registered');
        });

    });
    

    // user login test
    describe('POST /users/login', () => {
        // valid login test
        it('should login successfully with correct credentials', async () => {
            const res = await agent
                .post('/users/login')
                .send({ 
                    email: 'test@example.com',
                    password: 'password123'
                });
            
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body.message).toBe('Welcome Test');
        });
    
        // invalid login test with unregistered
        it('should fail login with incorrect credentials', async () => {
            const res = await agent
                .post('/users/login')
                .send({ 
                    email: 'wrong@example.com', 
                    password: 'wrongpass' 
                });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toBe('User not found');
        });

        // invalid login test with wrong password
        it('should fail login with incorrect password', async () => {
            const res = await agent
                .post('/users/login')
                .send({ 
                    email: 'test@example.com', 
                    password: 'wrongpass' 
                });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toBe('Invalid password');
        });
    });

    // Accessing routes that require login
    describe('GET /users/profile', () => {
        it('should prevent access to this page', async () => {
            const res = await agent 
                .get('/users/profile');

            expect(res.statusCode).toEqual(403);
            expect(res.body).toHaveProperty('title', 'Access Denied')
        });
    });

    // Test for logout
    describe('POST /users/logout', () => {
        it('should successfully logout a user', async () => {
            //create a user and login
            const resUser = new User({
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                password: 'password123',
                dateOfBirth: new Date()
            });
            await resUser.save();

            // login user
            const resLogin = await agent
            .post('/users/login')
            .send({ 
                email: 'test@example.com',
                password: 'password123'
            });

            // logout user
            const res = await agent
                .post('/users/logout');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);
        });
    });

});

