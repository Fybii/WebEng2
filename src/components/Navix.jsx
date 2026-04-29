import React from "react";
import {App, View} from 'framework7-react'

import routes from '../js/routes'
import '/css/navix.css';

const Navix = () => {
    return (
        <App routes={routes}>
            <View main url="/" browserHistory></View>
        </App>
    );
};

export default Navix;