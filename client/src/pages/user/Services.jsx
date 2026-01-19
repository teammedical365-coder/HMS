import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAppDispatch, useCachedServices, useCachedDoctors } from '../../store/hooks';
import { fetchServices, fetchDoctors } from '../../store/slices/publicDataSlice';
import './Services.css';

// Available time slots
const timeSlots = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30'
];

// Helper function for fallback specialty mapping
const getSpecialtyFromServices = (services) => {
  if (!services || services.length === 0) return 'General Practitioner';
  
  // Fallback map for legacy/static IDs if needed
  const specialtyMap = {
    'ivf': 'IVF Specialist',
    'iui': 'Infertility Specialist',
    'icsi': 'Reproductive Specialist',
    'egg-freezing': 'Fertility Preservation Specialist',
    'genetic-testing': 'Reproductive Geneticist',
    'donor-program': 'Reproductive Endocrinologist',
    'male-fertility': 'Urologist & Andrologist',
    'surrogacy': 'Reproductive Endocrinologist',
    'fertility-surgery': 'Fertility Surgeon'
  };
  
  // Return mapped specialty or capitalize the first service
  return specialtyMap[services[0]] || (typeof services[0] === 'string' ? services[0] : 'Specialist');
};

const Services = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  
  // Redux state
  const { services: servicesFromRedux, loading: loadingServices } = useCachedServices();
  const { doctors: allDoctorsData } = useCachedDoctors();
  
  // Ensure we default to an empty array if undefined
  const services = servicesFromRedux || [];
  
  // Booking form state
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [formData, setFormData] = useState({
    serviceId: '',
    doctorId: '',
    appointmentDate: '',
    appointmentTime: ''
  });
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch services and doctors from backend using Redux
  useEffect(() => {
    dispatch(fetchServices());
    dispatch(fetchDoctors());
  }, [dispatch]);
  
  // Memoize allDoctors
  const allDoctors = useMemo(() => {
    return allDoctorsData.map((doctor) => ({
      id: doctor._id || doctor.doctorId,
      name: doctor.name,
      // Prioritize the actual specialty field from DB, fallback to map
      specialty: doctor.specialty || getSpecialtyFromServices(doctor.services || []),
      services: doctor.services || [],
      // Keep original object for reference
      original: doctor
    }));
  }, [allDoctorsData]);
  
  // --- FIXED: Dynamic Doctor Filtering Logic ---
  useEffect(() => {
    if (formData.serviceId && allDoctors.length > 0) {
      // 1. Find the selected service object to get all its possible identifiers
      const selectedService = services.find(s => 
        (s.id && s.id.toString() === formData.serviceId) || 
        (s._id && s._id.toString() === formData.serviceId)
      );

      // 2. Build a list of valid matchers (ID, Title, Name) for this service
      // This ensures we match regardless of how the doctor stored the service reference
      let matchers = [formData.serviceId];
      if (selectedService) {
        matchers = [
          ...matchers,
          selectedService.id,    // Custom string ID (e.g. 'ivf')
          selectedService._id,   // MongoDB ObjectId
          selectedService.title, // Title (e.g. 'IVF Treatment')
          selectedService.name   // Fallback name
        ].filter(Boolean);       // Remove null/undefined
      }
      
      // Normalize matchers for case-insensitive comparison
      const normalizedMatchers = matchers.map(m => m.toString().toLowerCase());

      // 3. Filter doctors who have ANY of these service identifiers
      const filtered = allDoctors.filter(doc => {
        if (!doc.services || !Array.isArray(doc.services)) return false;

        return doc.services.some(docService => {
          // Handle cases where doctor service might be an object or a string
          const serviceVal = (typeof docService === 'object') 
            ? (docService.id || docService._id || docService.name) 
            : docService;
            
          return serviceVal && normalizedMatchers.includes(serviceVal.toString().toLowerCase());
        });
      });

      setAvailableDoctors(filtered);
    } else {
      setAvailableDoctors([]);
    }
  }, [formData.serviceId, allDoctors, services]);

  // Update available time slots based on date
  const updateAvailableTimes = useCallback((selectedDate) => {
    if (!selectedDate) {
      setAvailableTimes([]);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDateObj = new Date(selectedDate);
    selectedDateObj.setHours(0, 0, 0, 0);
    const now = new Date();
    
    let times = [...timeSlots];

    // If selected date is today, filter out past times
    if (selectedDateObj.getTime() === today.getTime()) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinute;

      times = times.filter(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const timeInMinutes = hours * 60 + minutes;
        // Add 30 minutes buffer - can't book if less than 30 minutes from now
        return timeInMinutes > (currentTimeInMinutes + 30);
      });
    }

    setAvailableTimes(times);
  }, []);

  // Scroll animation logic
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach((el) => observer.observe(el));

    // Cleanup
    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, [services]);

  // Update available times when doctor or date changes
  useEffect(() => {
    if (formData.doctorId && formData.appointmentDate) {
      updateAvailableTimes(formData.appointmentDate);
    } else {
      setAvailableTimes([]);
    }
  }, [formData.doctorId, formData.appointmentDate, updateAvailableTimes]);

  // Handle service card click - navigate to doctors page filtered by service
  const handleServiceClick = (serviceId) => {
    navigate(`/doctors?serviceId=${serviceId}`);
  };

  // Handle book new appointment button click
  const handleBookAppointment = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login?redirect=/services');
      return;
    }
    setShowBookingForm(true);
    setError('');
    setSuccess('');
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      serviceId: '',
      doctorId: '',
      appointmentDate: today,
      appointmentTime: ''
    });
    setAvailableDoctors([]);
    setAvailableTimes([]);
  };

  // Handle service selection
  const handleServiceChange = (e) => {
    const selectedServiceId = e.target.value;
    setFormData({
      ...formData,
      serviceId: selectedServiceId,
      doctorId: '', // Reset doctor when service changes
      appointmentTime: '' // Reset time when service changes
    });
  };

  // Handle doctor selection
  const handleDoctorChange = (e) => {
    const selectedDoctorId = e.target.value;
    setFormData({
      ...formData,
      doctorId: selectedDoctorId,
      appointmentTime: '' // Reset time when doctor changes
    });
  };

  // Handle date selection
  const handleDateChange = (e) => {
    const selectedDate = e.target.value;
    setFormData({
      ...formData,
      appointmentDate: selectedDate,
      appointmentTime: '' // Reset time when date changes
    });
  };

  // Get max date (7 days from today)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 7);
    return maxDate.toISOString().split('T')[0];
  };

  // Get min date (today)
  const getMinDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    // Validation
    if (!formData.serviceId || !formData.doctorId || !formData.appointmentDate || !formData.appointmentTime) {
      setError('Please fill in all fields');
      setIsSubmitting(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('You must be logged in to book an appointment');
      setIsSubmitting(false);
      navigate('/login?redirect=/services');
      return;
    }

    try {
      // Get selected service and doctor details
      const selectedService = services.find(s => 
        (s.id && s.id.toString() === formData.serviceId) || 
        (s._id && s._id.toString() === formData.serviceId)
      );
      
      const selectedDoctor = allDoctors.find(d => d.id === formData.doctorId);

      if (!selectedDoctor) {
        setError('Selected doctor not found');
        setIsSubmitting(false);
        return;
      }

      const appointmentData = {
        doctorId: selectedDoctor.id,
        doctorName: selectedDoctor.name,
        // Use the ID the backend expects (prefer object ID, fallback to string ID)
        serviceId: selectedService ? (selectedService.id || selectedService._id) : formData.serviceId,
        serviceName: selectedService ? (selectedService.title || selectedService.name) : 'Service',
        appointmentDate: formData.appointmentDate,
        appointmentTime: formData.appointmentTime,
        amount: selectedService ? (selectedService.price || 0) : 0, 
        notes: ''
      };

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/appointments/create`,
        appointmentData,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        setSuccess('Appointment booked successfully!');
        // Reset form
        setTimeout(() => {
          setShowBookingForm(false);
          setFormData({
            serviceId: '',
            doctorId: '',
            appointmentDate: getMinDate(),
            appointmentTime: ''
          });
          setAvailableDoctors([]);
          setAvailableTimes([]);
          setSuccess('');
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to book appointment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close booking form
  const handleCloseForm = () => {
    setShowBookingForm(false);
    setError('');
    setSuccess('');
    setFormData({
      serviceId: '',
      doctorId: '',
      appointmentDate: getMinDate(),
      appointmentTime: ''
    });
    setAvailableDoctors([]);
    setAvailableTimes([]);
  };

  return (
    <div className="services-page">
      <div className="content-wrapper">
        
        {/* Header Section */}
        <section className="services-header animate-on-scroll slide-up">
          <span className="badge">Our Specialized Services</span>
          <h1>
            Comprehensive <span className="text-gradient">Medical Services</span>
          </h1>
          <p className="header-subtext">
            World-class treatments with cutting-edge technology and compassionate care. 
            Choose a service to view our specialized doctors.
          </p>
        </section>

        {/* Services Grid */}
        <section className="services-grid-section">
          {loadingServices ? (
             <div className="loading-state">Loading services...</div>
          ) : services.length === 0 ? (
             <div className="empty-state">No services currently available.</div>
          ) : (
            <div className="services-grid">
              {services.map((service, index) => (
                <div
                  key={service.id || service._id}
                  className={`service-card animate-on-scroll slide-up delay-${(index % 3) * 100}`}
                  onClick={() => handleServiceClick(service.id || service._id)}
                >
                  {/* Card Icon */}
                  <div className="service-icon-wrapper">
                    <div className="service-icon" style={{ '--icon-color': service.color || '#14C38E' }}>
                      {service.icon || '🏥'}
                    </div>
                    <div className="icon-glow"></div>
                  </div>

                  {/* Card Content */}
                  <div className="service-content">
                    <h3>{service.title || service.name}</h3>
                    <p>{service.description}</p>
                    {service.price > 0 && (
                        <p className="service-price" style={{marginTop:'0.5rem', fontWeight:'bold', color: '#14C38E'}}>
                            Starting at ₹{service.price}
                        </p>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="service-footer">
                    <span className="learn-more">
                      View Specialists <span className="arrow">→</span>
                    </span>
                  </div>

                  {/* Hover Effect Overlay */}
                  <div className="card-overlay"></div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CTA Section */}
        <section className="services-cta animate-on-scroll fade-in">
          <div className="cta-card">
            <h2>Ready to Book Your Appointment?</h2>
            <p>Schedule your consultation with our expert team today.</p>
            <button className="btn btn-primary" onClick={handleBookAppointment}>
              Book New Appointment
            </button>
          </div>
        </section>

      </div>

      {/* Booking Form Modal */}
      {showBookingForm && (
        <div className="booking-modal-overlay" onClick={handleCloseForm}>
          <div className="booking-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="booking-modal-header">
              <h2>Book New Appointment</h2>
              <button className="close-button" onClick={handleCloseForm}>×</button>
            </div>

            {error && (
              <div className="booking-error-message">
                {error}
              </div>
            )}

            {success && (
              <div className="booking-success-message">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="booking-form">
              {/* Service Selection */}
              <div className="form-group">
                <label htmlFor="serviceId">Service *</label>
                <select
                  id="serviceId"
                  name="serviceId"
                  value={formData.serviceId}
                  onChange={handleServiceChange}
                  required
                  className="form-select"
                >
                  <option value="">Select a service</option>
                  {services.map(service => (
                    <option key={service.id || service._id} value={service.id || service._id}>
                      {service.title || service.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Doctor Selection */}
              <div className="form-group">
                <label htmlFor="doctorId">Doctor *</label>
                <select
                  id="doctorId"
                  name="doctorId"
                  value={formData.doctorId}
                  onChange={handleDoctorChange}
                  required
                  disabled={!formData.serviceId || availableDoctors.length === 0}
                  className="form-select"
                >
                  <option value="">
                    {!formData.serviceId 
                      ? 'Please select a service first' 
                      : availableDoctors.length === 0 
                      ? 'No doctors available for this service'
                      : 'Select a doctor'}
                  </option>
                  {availableDoctors.map(doctor => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name} - {doctor.specialty}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Selection */}
              <div className="form-group">
                <label htmlFor="appointmentDate">Date *</label>
                <input
                  type="date"
                  id="appointmentDate"
                  name="appointmentDate"
                  value={formData.appointmentDate}
                  onChange={handleDateChange}
                  min={getMinDate()}
                  max={getMaxDate()}
                  required
                  className="form-input"
                />
                <small className="form-hint">You can book appointments up to 7 days in advance</small>
              </div>

              {/* Time Selection */}
              <div className="form-group">
                <label htmlFor="appointmentTime">Time *</label>
                <select
                  id="appointmentTime"
                  name="appointmentTime"
                  value={formData.appointmentTime}
                  onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                  required
                  disabled={!formData.doctorId || !formData.appointmentDate || availableTimes.length === 0}
                  className="form-select"
                >
                  <option value="">
                    {!formData.doctorId || !formData.appointmentDate
                      ? 'Please select doctor and date first'
                      : availableTimes.length === 0
                      ? 'No available time slots'
                      : 'Select a time'}
                  </option>
                  {availableTimes.map(time => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
                {formData.appointmentDate && availableTimes.length === 0 && formData.doctorId && (
                  <small className="form-hint error-text">
                    No available time slots for this date. Please select another date.
                  </small>
                )}
              </div>

              {/* Submit Button */}
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleCloseForm}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Booking...' : 'Confirm and Pay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Services;