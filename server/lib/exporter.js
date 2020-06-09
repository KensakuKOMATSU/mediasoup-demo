const mediasoup = require('mediasoup');
const express = require('express')
const pidusage = require('pidusage')

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
