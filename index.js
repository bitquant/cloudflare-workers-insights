'use strict';

const { v4: uuidv4 } = require('uuid');


async function handleRequest(params) {

    let { event, handler, serviceName, logger } = params;

    let startTime = Date.now();
    let correlationId = getCorrelationId(event);
    let caller = getCaller(event);
    let context = { correlationId: correlationId, caller: caller };
    let waitUntil = (p) => event.waitUntil(p);
    const fetchRequests = [];
    const logs = [];

    context.log = (data) => {
        let logEntry = {
            service: serviceName,
            correlationId: correlationId,
        };
        Object.assign(logEntry, data);
        logs.push(logEntry);
    };

    context.fetch = async (request, options) => {

        let fetchStart = Date.now();
        let fetchRequest = new Request(request, options);
        let fetchError = null;

        let logEntry = {
            service: serviceName,
            correlationId: correlationId,
            url: fetchRequest.url,
            method: fetchRequest.method
        };

        try {
            if (fetchRequest.headers.has('x-correlation-id') === false) {
                fetchRequest.headers.set('x-correlation-id', correlationId);
            }
            if (fetchRequest.headers.has('x-caller') === false) {
                fetchRequest.headers.set('x-caller', serviceName);
            }
            var response = await (options?.service ? globalThis[options?.service].fetch(fetchRequest) : fetch(fetchRequest));
            logEntry.status = response.status;
        }
        catch(err) {
            logEntry.status = 999;
            logEntry.err = `${err}`;
            fetchError = err;
        }

        logEntry.duration = Date.now() - fetchStart;
        logEntry.startTime = fetchStart;

        fetchRequests.push(logEntry);

        if (fetchError !== null) {
            throw fetchError;
        }

        return response;
    };

    let result = await handler(event, context);
    let endTime = Date.now();
    let duration = endTime - startTime;

    if (event.type === 'fetch') {

        let request = event.request;

        let data = {
            service: serviceName,
            url: request.url,
            method: request.method,
            status: result.status,
            duration: duration,
            correlationId: correlationId,
            caller: caller,
            ip: request.headers?.get('Cf-Connecting-IP'),
            colo: request.cf?.colo,
            asn: request.cf?.asn,            
            aso: request.cf?.asOrganization,
            latitude: request.cf?.latitude,
            longitude: request.cf?.longitude,
            city: request.cf?.city,
            region: request.cf?.region,
            regionCode: request.cf?.regionCode,
            postalCode: request.cf?.postalCode,
            metroCode: request.cf?.metroCode,
            timezone: request.cf?.timezone,
            country: request.cf?.country,
            continent: request.cf?.continent,
        };

        const loggerPayload = { 
            message: `request ${event.request.url}`,
            request: data, 
            subrequests: fetchRequests, 
            logs: logs
        }

        logger(loggerPayload, waitUntil);
    }
    else if (event.type === 'scheduled') {

        let data = {
            service: serviceName,
            correlationId: correlationId,
            caller: caller,
            duration: duration,
            scheduledTime: event.scheduledTime,
            result: result,
        };

        const loggerPayload = { 
            message: `scheduled ${serviceName}`,
            scheduled: data,
            subrequests: fetchRequests, 
            logs: logs
        }

        logger(loggerPayload, waitUntil);
    }

    return result;
}

function getCorrelationId(event) {

    let correlationId;

    if (event.type === 'fetch') {
        correlationId = event.request.headers.get('x-correlation-id');
        if (correlationId === null) {
            correlationId = event.request.headers.get('cf-ray');
        }
    }
    else  {
        correlationId = uuidv4();
    }

    return correlationId;
}

function getCaller(event) {

    let caller;

    if (event.type === 'fetch') {
        caller = event.request.headers.get('x-caller');
        if (caller === null) {
            caller = 'internet';
        }
    }
    else if (event.type === 'scheduled') {
        caller = 'scheduler';
    }
    else {
        caller = 'unsupported';
    }

    return caller;
}

module.exports = handleRequest;
