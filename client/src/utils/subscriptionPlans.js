export const SUBSCRIPTION_PLANS = {
    enterprise: {
        name: 'Enterprise Plan',
        maxDoctors: Infinity,
        maxStaff: Infinity,
    },
    multi_speciality_starter: {
        name: 'Multi-Speciality Starter Plan',
        maxDoctors: 15,
        maxStaff: 25,
    },
    clinic_basic: {
        name: 'Clinic Basic Plan',
        maxDoctors: 5,
        maxStaff: 3,
    },
    starter: {
        name: 'Starter Plan',
        maxDoctors: Infinity,
        maxStaff: Infinity,
    }
};

export const getSubscriptionLimits = (planId) => {
    return SUBSCRIPTION_PLANS[planId] || { maxDoctors: Infinity, maxStaff: Infinity, name: 'Unknown Plan' };
};
