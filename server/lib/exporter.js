const mediasoup = require('mediasoup');
const express = require('express')
const pidusage = require('pidusage')
const promClient = require('prom-client')

const collectDefaultMetrics = promClient.collectDefaultMetrics;
const register = new promClient.Registry()

collectDefaultMetrics({register});  // デフォルトで組み込まれているメトリクスを、デフォルト10秒間隔で取得

const {
 getWorkersDump,
 getRouterIds,
 getRoutersDump,
 getProducerIds,
 getConsumerIds,
 getProducersStats,
 getConsumersStats,
} = require('./util-exporter')

// Maps to store all mediasoup objects.
const workers = new Map();
const routers = new Map();
const transports = new Map();
const producers = new Map();
const consumers = new Map();
const dataProducers = new Map();
const dataConsumers = new Map();

function runMediasoupObserver()
{
 mediasoup.observer.on('newworker', (worker) => {

  workers.set(worker.pid, worker);
  worker.observer.on('close', () => workers.delete(worker.pid));

  worker.observer.on('newrouter', (router) =>
  {
   routers.set(router.id, router);
   router.observer.on('close', () => routers.delete(router.id));

   router.observer.on('newtransport', (transport) =>
   {
    transports.set(transport.id, transport);
    transport.observer.on('close', () => transports.delete(transport.id));

    transport.observer.on('newproducer', (producer) =>
    {
     producers.set(producer.id, producer);
     producer.observer.on('close', () => producers.delete(producer.id));
    });

    transport.observer.on('newconsumer', (consumer) =>
    {
     consumers.set(consumer.id, consumer);
     consumer.observer.on('close', () => consumers.delete(consumer.id));
    });

    transport.observer.on('newdataproducer', (dataProducer) =>
    {
     dataProducers.set(dataProducer.id, dataProducer);
     dataProducer.observer.on('close', () => dataProducers.delete(dataProducer.id));
    });

    transport.observer.on('newdataconsumer', (dataConsumer) =>
    {
     dataConsumers.set(dataConsumer.id, dataConsumer);
     dataConsumer.observer.on('close', () => dataConsumers.delete(dataConsumer.id));
    });
   });
  });
 });
}

module.exports = async function() {
 // Run the mediasoup observer API.
 runMediasoupObserver();

 const app = express()

 app.get('/metrics', async (_, res) => {
  // process
  const usages = []
  const pusage = await pidusage(process.pid)
  usages.push( Object.assign({}, pusage, { type: 'parent' }) )
  let wusage
  for( let worker of workers.values() ) {
   wusage =  await pidusage( worker.pid )
   usages.push( Object.assign({}, wusage, { type: 'worker' }))
  }
  const mediasoup_processes_num = {
   labels: {},
   value: usages.length
  }
  const mediasoup_processes_cpu_usage = usages.map( (usage) => ({
   labels: { pid: usage.pid, ppid: usage.ppid, type: usage.type },
   value: usage.cpu
  }))
  const mediasoup_processes_memory_usage = usages.map( usage => ({
   labels: { pid: usage.pid, ppid: usage.ppid, type: usage.type },
   value: usage.memory
  }))

  // workers
  const workersDump = await getWorkersDump( workers )
  const routerIds = getRouterIds( workersDump )
  const routersDump = await getRoutersDump( routers, routerIds )

  const mediasoup_workers_active_num = {
   labels: {},
   value: workersDump.filter( w => w.routerIds.length > 0).length
  }
  const mediasoup_workers_idle_num = {
   labels: {},
   value: workersDump.filter( w => w.routerIds.length === 0).length
  }
  const mediasoup_workers_total_num = {
   labels: {},
   value: workersDump.length
  }
  const mediasoup_routers_num = {
   labels: {},
   value: routerIds.length
  }

  const producerIds = getProducerIds( routersDump )
  const producersStats = await getProducersStats( producerIds, producers)

  const mediasoup_producers_num = {
   labels: {},
   value: producerIds.length
  }

  const mediasoup_producers_byte_count = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.byteCount
  }))

  const mediasoup_producers_fir_count = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.firCount
  }))

  const mediasoup_producers_jitter = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.jitter
  }))

  const mediasoup_producers_nack_count = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.nackCount
  }))

  const mediasoup_producers_nack_packet_count = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.nackPacketCount
  }))

  const mediasoup_producers_packet_count = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.packetCount
  }))

  const mediasoup_producers_packets_discarded = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.packetsDiscarded
  }))

  const mediasoup_producers_packets_lost = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.packetsLost
  }))

  const mediasoup_producers_packets_repaired = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.packetsRepaired
  }))

  const mediasoup_producers_packets_retransmitted = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.packetsRetransmitted
  }))

  const mediasoup_producers_pli_count = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.pliCount
  }))

  const mediasoup_producers_round_trip_time = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.roundTripTime
  }))

  const mediasoup_producers_score = producersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    producerId: stats.producerId
   },
   value: stats.score
  }))

  const consumerIds = getConsumerIds( routersDump )
  const consumersStats = await getConsumersStats( consumerIds, consumers)

  const mediasoup_consumers_num = {
   labels: {},
   value: consumerIds.length
  }

  const mediasoup_consumers_byte_count = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.byteCount
  }))

  const mediasoup_consumers_fir_count = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.firCount
  }))

  const mediasoup_consumers_nack_count = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.nackCount
  }))

  const mediasoup_consumers_nack_packet_count = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.nackPacketCount
  }))

  const mediasoup_consumers_packet_count = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.packetCount
  }))

  const mediasoup_consumers_packets_discarded = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.packetsDiscarded
  }))

  const mediasoup_consumers_packets_lost = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.packetsLost
  }))

  const mediasoup_consumers_packets_repaired = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.packetsRepaired
  }))

  const mediasoup_consumers_packets_retransmitted = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.packetsRetransmitted
  }))

  const mediasoup_consumers_pli_count = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.pliCount
  }))

  const mediasoup_consumers_round_trip_time = consumersStats.map( stats => ({
   labels: {
    kind: stats.kind,
    mimeType: stats.mimeType,
    type: stats.type,
    consumerId: stats.consumerId
   },
   value: stats.roundTripTime
  }))

  const obj = {
   mediasoup_processes_num,
   mediasoup_processes_cpu_usage,
   mediasoup_processes_memory_usage,
   mediasoup_workers_active_num,
   mediasoup_workers_idle_num,
   mediasoup_workers_total_num,
   mediasoup_routers_num,
   mediasoup_producers_num,
   mediasoup_producers_byte_count,
   mediasoup_producers_fir_count,
   mediasoup_producers_jitter,
   mediasoup_producers_nack_count,
   mediasoup_producers_nack_packet_count,
   mediasoup_producers_packet_count,
   mediasoup_producers_packets_discarded,
   mediasoup_producers_packets_lost,
   mediasoup_producers_packets_repaired,
   mediasoup_producers_packets_retransmitted,
   mediasoup_producers_pli_count,
   mediasoup_producers_round_trip_time,
   mediasoup_producers_score,
   mediasoup_consumers_num,
   mediasoup_consumers_byte_count,
   mediasoup_consumers_fir_count,
   mediasoup_consumers_nack_count,
   mediasoup_consumers_nack_packet_count,
   mediasoup_consumers_packet_count,
   mediasoup_consumers_packets_discarded,
   mediasoup_consumers_packets_lost,
   mediasoup_consumers_packets_repaired,
   mediasoup_consumers_packets_retransmitted,
   mediasoup_consumers_pli_count,
   mediasoup_consumers_round_trip_time,
  }

  const _register = new promClient.Registry()

  Object.entries( obj ).forEach( ([key, o]) => {
   if( Array.isArray( o ) ) {
    const gauge = new promClient.Gauge({
     name: key,
     help: key,
     labelNames: (
            typeof(o[0]) === 'object'
            && typeof(o[0]).labels === 'object'
          ) ? Object.keys(o[0].labels): [],
     registers: [ _register ]
    })
    let summary
    if( key.startsWith("mediasoup_process") ) {
     summary = new promClient.Summary({
      name: key + "_bucket",
      help: key,
      registers: [ _register ]
     })
    }

    o.forEach( _o => {
     if( !isNaN( _o.value )) gauge.set(_o.labels, _o.value)
     if( summary ) summary.observe( _o.value )
    })
   } else {
    if( o.value ) {
     const gauge = new promClient.Gauge({
      name: key,
      help: key,
      labelNames: Object.keys(o.labels),
      registers: [ _register ]
     })
     gauge.set( o.labels, o.value )
    }
   }
  })


  const ret = promClient.Registry.merge([register, _register]).metrics()

  res.set("Content-Type", "text/plain")
  res.send( ret )
 })

 app.get('/workers', async (_, res) => {
  const workersDump = await getWorkersDump( workers )
  res.json(workersDump)
 })

 app.get('/routers', async (_, res) => {
  const workersDump = await getWorkersDump( workers )
  const routerIds = getRouterIds( workersDump )
  const routersDump = await getRoutersDump( routers, routerIds )

  res.json( routersDump )
 })

 app.get('/producers', async (_, res) => {
  const workersDump = await getWorkersDump( workers )
  const routerIds = getRouterIds( workersDump )
  const routersDump = await getRoutersDump( routers, routerIds )
  const producerIds = getProducerIds( routersDump )
  const producersStats = await getProducersStats( producerIds, producers)

  res.json( producersStats )

 })

 app.get('/consumers', async (_, res) => {
  const workersDump = await getWorkersDump( workers )
  const routerIds = getRouterIds( workersDump )
  const routersDump = await getRoutersDump( routers, routerIds )
  const consumerIds = getConsumerIds( routersDump )
  const consumersStats = await getConsumersStats( consumerIds, consumers)

  res.json( consumersStats )
 })



 app.get('/usage', async (_, res) => {
  const usages = []

  const pusage = await pidusage(process.pid)
  usages.push( Object.assign({}, pusage, { type: 'parent' }) )

  let wusage
  for( let worker of workers.values() ) {
   wusage =  await pidusage( worker.pid )
   usages.push( Object.assign({}, wusage, { type: 'worker' }))
  }
  res.json( usages )
 })

 app.listen(4000, _ => {
  console.log('mediasoup-exporter started on port', 4000)
 })
};
