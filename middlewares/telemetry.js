const {NodeSDK} = require('@opentelemetry/sdk-node')
const {getNodeAutoInstrumentations} = require('@opentelemetry/auto-instrumentations-node')
const {OTLPTraceExporter} = require('@opentelemetry/exporter-trace-otlp-http')
const { SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base')

const {trace} = require("@opentelemetry/api");
const tracer = trace.getTracer('app-tracer');


const traceExporter = new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces"
})

const sdk = new NodeSDK({
    spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
    traceExporter,
    instrumentations: [
        getNodeAutoInstrumentations()
    ]
})

sdk.start()
console.log('Open Telemetry initialised');

module.exports = tracer;