// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('../polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');
process.env.TEST_MODE = '1';

const assert = require('assert');
//const Tp = require('thingpedia');

const db = require('../../util/db');
const TrainingServer = require('../../util/training_server');

async function delay(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
}

async function waitUntilAllJobsDone() {
    for (;;) {
        const row = await db.withClient((dbClient) => {
            return db.selectOne(dbClient,
                `select count(*) as cnt from training_jobs where status in ('started','queued')`);
        });
        console.log(row);
        if (row.cnt === 0)
            break;

        await delay(10000);
    }

    const failed = await db.withClient((dbClient) => {
        return db.selectAll(dbClient,
            `select * from training_jobs where status = 'error'`);
    });
    assert.deepStrictEqual(failed, []);
}

function removeTimes(queue) {
    for (let jobType in queue) {
        for (let job of queue[jobType]) {
            job.start_time = null;
            job.end_time = null;

            // remove task_index/task_name too, as that could be racy
            job.task_index = null;
            job.task_name = null;
        }
    }
}

async function testBasic() {
    const server = TrainingServer.get();

    // issue a basic train command

    await server.queue('en', null, 'train');

    const queue = await server.getJobQueue();
    //console.log(queue);
    removeTimes(queue);

    assert.deepStrictEqual(queue, {
        'update-dataset': [ {
            id: 1,
            depends_on: null,
            job_type: 'update-dataset',
            language: 'en',
            model_tag: null,
            all_devices: 1,
            status: 'started',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config:
            '{"synthetic_depth":2,"train_iterations":10,"save_every":2,"val_every":2,"log_every":2,"trainable_decoder_embedding":10,"no_glove_decoder":true,"no_commit":true}',
            metrics: null,
            for_devices: [] }
        ],
        train: [ {
            id: 2,
            depends_on: 1,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.default',
            all_devices: 1,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: null,
            metrics: null,
            for_devices: []
        }, {
            id: 3,
            depends_on: 1,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.developer',
            all_devices: 1,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: null,
            metrics: null,
            for_devices: []
        }
    ]});

    await waitUntilAllJobsDone();
}

async function testForDevice() {
    const server = TrainingServer.get();

    // issue a train command for a device that is not approved

    await server.queue('en', ['org.thingpedia.builtin.test.adminonly'], 'train');

    const queue = await server.getJobQueue();
    //console.log(queue);
    removeTimes(queue);

    assert.deepStrictEqual(queue, {
        'update-dataset': [ {
            id: 4,
            depends_on: null,
            job_type: 'update-dataset',
            language: 'en',
            model_tag: null,
            all_devices: 0,
            status: 'started',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config:
            '{"synthetic_depth":2,"train_iterations":10,"save_every":2,"val_every":2,"log_every":2,"trainable_decoder_embedding":10,"no_glove_decoder":true,"no_commit":true}',
            metrics: null,
            for_devices: ['org.thingpedia.builtin.test.adminonly'] }
        ],
        train: [ {
            id: 5,
            depends_on: 4,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.developer',
            all_devices: 0,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: null,
            metrics: null,
            for_devices: ['org.thingpedia.builtin.test.adminonly']
        }
    ]});

    const queue2 = await server.check('en', 'org.thingpedia.builtin.test.adminonly');
    //console.log(queue);
    removeTimes(queue2);

    assert.deepStrictEqual(queue2, {
        'update-dataset': [ {
            id: 4,
            depends_on: null,
            job_type: 'update-dataset',
            language: 'en',
            model_tag: null,
            all_devices: 0,
            status: 'started',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config:
            '{"synthetic_depth":2,"train_iterations":10,"save_every":2,"val_every":2,"log_every":2,"trainable_decoder_embedding":10,"no_glove_decoder":true,"no_commit":true}',
            metrics: null
        } ],
        train: [ {
            id: 5,
            depends_on: 4,
            job_type: 'train',
            language: 'en',
            model_tag: 'org.thingpedia.models.developer',
            all_devices: 0,
            status: 'queued',
            task_index: null,
            task_name: null,
            error: null,
            progress: 0,
            eta: null,
            start_time: null,
            end_time: null,
            config: null,
            metrics: null,
        }
    ]});

    const queue3 = await server.check('en', 'com.bing');
    assert.deepStrictEqual(queue3, {});

    await waitUntilAllJobsDone();
}

async function main() {
    await testBasic();
    await testForDevice();

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();