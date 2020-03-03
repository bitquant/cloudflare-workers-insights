'use strict';

async function handleRequest(params) {

    let { event, handler, serviceName, logger } = params;

    let startTime = Date.now();
    let request = event.request;
    let correlationId = getCorrelationId(request);
    let context = { correlationId: correlationId };
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
        country: request.cf.country,
        colo: request.cf.colo
    }

    logger({ request: data }, (p) => event.waitUntil(p));

    return response;
}

function getCorrelationId(request) {

    let correlationId = request.headers.get('x-correlation-id');
    if (correlationId === null) {
        correlationId = request.headers.get('cf-ray')
    }

    return correlationId;
}

module.exports = handleRequest;
