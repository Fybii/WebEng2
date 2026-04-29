import { Page } from 'framework7-react';
import React, { useEffect, useState } from 'react';
import Map from '../components/Map';

const LandingPage = () => {
    return (
        <Page name='landing' className='landing-page'>
            <Map />
        </Page>
    );
};

export default LandingPage;