// logger/logger.js
const { createLogger, format, transports } = require('winston');
const path = require('path');

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.json()
    ),
    transports: [
        new transports.File({
            filename: path.join(__dirname, 'errors.log'),
            level: 'error'
        }),
        new transports.File({
            filename: path.join(__dirname, 'combined.log')
        }),
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        })
    ]
});


// Handle crashes
logger.exceptions.handle(
    new transports.File({ filename: path.join(__dirname, 'exceptions.log') })
);

module.exports = logger;
