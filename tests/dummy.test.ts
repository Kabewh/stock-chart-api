import request from 'supertest';
import app from '../src/index';

describe('App Endpoints', () => {
  let server: any;

  beforeAll((done) => {
    // Start the server on a different port for testing to avoid conflicts
    server = app.listen(3001, () => {
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should return a 200 OK from the health check', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      message: 'API is running',
    });
  });
});