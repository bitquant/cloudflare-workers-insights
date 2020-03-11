'use strict';

async function handleRequest(params) {

    let { event, handler, serviceName, logger } = params;

    let startTime = Date.now();
    let request = event.request;
    let correlationId = getCorrelationId(request);
    let requester = getRequester(request);
    let context = { correlationId: correlationId, requester: requester };
    let waitUntil = (p) => event.waitUntil(p);

    context.log = (data) => {
        let logEntry = {
            service: serviceName,
            correlationId: correlationId,
        };
        Object.assign(logEntry, data);
        return logger({ log: logEntry }, waitUntil);
    };

    context.fetch = async (request, params) => {

        let fetchStart = Date.now();
        let fetchRequest = new Request(request, params);
        let fetchError = null;

        let logEntry = {
            service: serviceName,
            correlationId: correlationId,
            url: fetchRequest.url,
            method: fetchRequest.method
        }

        try {
            if (fetchRequest.headers.has('x-correlation-id') === false) {
                fetchRequest.headers.set('x-correlation-id', correlationId);
            }
            if (fetchRequest.headers.has('x-requester') === false) {
                fetchRequest.headers.set('x-requester', serviceName);
            }
            var response = await fetch(fetchRequest);
            logEntry.status = response.status;
        }
        catch(err) {
            logEntry.status = 999;
            logEntry.err = `${err}`
            fetchError = err;
        }

        logEntry.duration = Date.now() - fetchStart;

        logger({ fetch: logEntry }, waitUntil);

        if (fetchError !== null) {
            throw fetchError;
        }

        return response;
    };

    let response = await handler(event, context);
    let endTime = Date.now();
    let duration = endTime - startTime;

    let data = {
        service: serviceName,
        url: request.url,
        method: request.method,
        status: response.status,
        duration: duration,
        correlationId: correlationId,
        requester: requester,
        country: request.cf.country,
        colo: request.cf.colo
    }

    logger({ request: data }, waitUntil);

    return response;
}

function getCorrelationId(request) {

    let correlationId = request.headers.get('x-correlation-id');
    if (correlationId === null) {
        correlationId = request.headers.get('cf-ray')
    }

    return correlationId;
}

function getRequester(request) {

    let requester = request.headers.get('x-requester');
    if (requester === null) {
        requester = 'unknown'
    }

    return requester;
}

module.exports = handleRequest;
